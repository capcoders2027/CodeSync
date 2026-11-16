import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// Map project languages to Docker images
const LANGUAGE_IMAGES: Record<string, string> = {
  python: 'python:3.11-slim',
  javascript: 'node:20-alpine',
  typescript: 'node:20-alpine',
  java: 'openjdk:17-slim',
};

// Map project languages to run commands inside the container
const getRunCommand = (language: string, entryFile: string): string => {
  switch (language) {
    case 'python':
      return `python ${entryFile}`;
    case 'javascript':
    case 'typescript':
      return `node ${entryFile}`;
    case 'java':
      return `java ${entryFile}`;
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
};

/**
 * Direct process execution on the host machine.
 * Detects long-running web servers (Flask, Express, FastAPI) and captures startup status.
 */
function runDirectProcess(
  language: string,
  targetDir: string,
  targetFile: string,
  startTime: number
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    let cmd = language === 'python'
      ? (process.platform === 'win32' ? 'python' : 'python3')
      : (language === 'java' ? 'java' : 'node');

    const child = spawn(cmd, [targetFile], {
      cwd: targetDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PATH: `C:\\Program Files\\nodejs;${process.env.PATH || ''}`,
      },
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;

    const cleanupAndResolve = (result: ExecutionResult) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(result);
    };

    // 30s timeout guard
    timer = setTimeout(() => {
      cleanupAndResolve({
        stdout,
        stderr: stderr ? `${stderr}\nExecution timed out (30s limit exceeded)` : 'Execution timed out (30s limit exceeded)',
        exitCode: 124,
        durationMs: Date.now() - startTime,
      });
    }, 30000);

    const checkServerStartup = (chunk: string) => {
      const serverKeywords = [
        'Running on http',
        'Serving Flask app',
        'Debugger is active',
        'Uvicorn running on',
        'Server running on',
        'listening on port',
        'Started server on',
        'Press CTRL+C to quit',
      ];
      if (!resolved && serverKeywords.some(kw => chunk.includes(kw))) {
        // Wait 600ms to collect any final startup output
        setTimeout(() => {
          const banner = `\n\n✨ [CodeSync] Application server is running! To interact with it live or test routes continuously, use the Terminal tab below.`;
          cleanupAndResolve({
            stdout: stdout + banner,
            stderr,
            exitCode: 0,
            durationMs: Date.now() - startTime,
          });
        }, 600);
      }
    };

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      checkServerStartup(text);
    });

    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      checkServerStartup(text);
    });

    child.on('error', (err) => {
      cleanupAndResolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      cleanupAndResolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

export const executeCode = async (
  language: string,
  files: { name: string; content: string | null }[],
  entryFile: string
): Promise<ExecutionResult> => {
  const image = LANGUAGE_IMAGES[language];
  if (!image) {
    throw new Error(`Unsupported execution language: ${language}`);
  }

  // 1. Create a unique temporary directory.
  // In Docker Compose, EXEC_HOST_TMPDIR points to a named-volume path that is
  // shared between the server container and spawned execution containers via the
  // same volume mount. This is the path Docker (on the host daemon) will mount.
  // In local dev (no Docker), we fall back to process.cwd()/.tmp.
  const runId = randomBytes(16).toString('hex');
  const baseDir = process.env.EXEC_HOST_TMPDIR || path.join(process.cwd(), '.tmp', 'execution');
  const tempDir = path.join(baseDir, runId);
  await fs.mkdir(tempDir, { recursive: true });

  const startTime = Date.now();

  try {
    // 2. Write all project files to the temporary directory
    for (const file of files) {
      if (file.content !== null) {
        const safeName = path.normalize(file.name).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(tempDir, safeName);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf8');
      }
    }

    // 3. Build the secure Docker command
    // --rm: Remove container after run
    // --network none: No internet access
    // --memory 256m: Prevent memory exhaustion
    // --cpus 0.5: Prevent CPU hogging
    // --pids-limit 64: Prevent fork bombs
    const runCmd = getRunCommand(language, entryFile);
    
    let dockerCmd: string;

    if (process.env.EXEC_VOLUME_NAME) {
      // ── Docker Compose mode ──────────────────────────────────────────────
      // The server writes files into the named volume at /exec_tmp/<runId>.
      // We mount the named volume into the execution container by NAME so the
      // host Docker daemon can resolve it — host paths inside the server
      // container are NOT visible to the Docker daemon.
      const volumeName = process.env.EXEC_VOLUME_NAME;
      dockerCmd = `docker run --rm --network none --memory 256m --cpus 0.5 --pids-limit 64 -v "${volumeName}:/exec_tmp:ro" -w "/exec_tmp/${runId}" ${image} sh -c "${runCmd}"`;
    } else {
      // ── Local dev mode ───────────────────────────────────────────────────
      // Server runs on the host so tempDir IS a host path Docker can bind-mount.
      const mountPath = tempDir.replace(/\\/g, '/');
      const volumePrefix = mountPath.match(/^[a-zA-Z]:/) ? '/' + mountPath.replace(':', '') : mountPath;
      dockerCmd = `docker run --rm --network none --memory 256m --cpus 0.5 --pids-limit 64 -v "${volumePrefix}:/app:ro" -w /app ${image} sh -c "${runCmd}"`;
    }

    const entryDir = path.dirname(entryFile);
    const targetDir = entryDir && entryDir !== '.' ? path.join(tempDir, entryDir) : tempDir;
    const targetFile = path.basename(entryFile);

    console.log(`[Exec] TempDir: ${tempDir}, RunId: ${runId}`);
    console.log(`[Exec] Files written:`, files.map(f => f.name));
    console.log(`[Exec] TargetDir: ${targetDir}, TargetFile: ${targetFile}`);
    console.log(`[Exec] Docker command: ${dockerCmd}`);
    // 4. Execute: Try Docker first; if host environment lacks Docker or Docker fails due to missing dependencies, fall back to direct process execution
    try {
      const { stdout, stderr } = await execAsync(dockerCmd, { timeout: 30000 });
      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      const isMissingDeps = error.stderr && (
        error.stderr.includes('ModuleNotFoundError') ||
        error.stderr.includes('ImportError') ||
        error.stderr.includes('Cannot find module')
      );
      const isDockerMissing = error.code === 127 ||
        (error.stderr && error.stderr.includes('docker: not found')) ||
        (error.message && error.message.includes('docker: not found')) ||
        Boolean(isMissingDeps);

      if (isDockerMissing) {
        console.log(`[Exec] Falling back to direct host execution: ${targetDir} -> ${targetFile}`);
        return await runDirectProcess(language, targetDir, targetFile, startTime);
      }

      if (error.killed) {
        return {
          stdout: error.stdout || '',
          stderr: 'Execution timed out (30s limit exceeded)',
          exitCode: 124,
          durationMs: Date.now() - startTime,
        };
      }
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || 'Execution failed',
        exitCode: error.code || 1,
        durationMs: Date.now() - startTime,
      };
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to cleanup temp dir ${tempDir}`, e);
    }
  }
};
