import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';
import { executeCode } from '../services/execution';

export const runConfigRouter = Router({ mergeParams: true });

runConfigRouter.use(requireAuth, requireProjectRole(['team_lead', 'member']));

const updateConfigSchema = z.object({
  projectType: z.string().min(1).max(30),
  entryCommand: z.string().min(1).max(500),
  buildCommand: z.string().max(500).nullable().optional(),
  workingDir: z.string().max(200).default('/'),
  envVars: z.record(z.string()).default({}),
});

// ---------------------------------------------------------------------------
// GET - Get or auto-detect run configuration
// ---------------------------------------------------------------------------
runConfigRouter.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    // Check if config already exists
    let config = await prisma.runConfiguration.findUnique({
      where: { projectId },
    });

    if (config) {
      return res.json({ status: 'success', data: { config } });
    }

    // Auto-detect from project files
    const detected = await detectProjectType(projectId);

    res.json({
      status: 'success',
      data: {
        config: null,
        detected,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT - Save/update run configuration
// ---------------------------------------------------------------------------
runConfigRouter.put('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const body = updateConfigSchema.parse(req.body);

    const config = await prisma.runConfiguration.upsert({
      where: { projectId },
      update: {
        projectType: body.projectType,
        entryCommand: body.entryCommand,
        buildCommand: body.buildCommand || null,
        workingDir: body.workingDir,
        envVars: body.envVars,
        autoDetected: false,
      },
      create: {
        projectId,
        projectType: body.projectType,
        entryCommand: body.entryCommand,
        buildCommand: body.buildCommand || null,
        workingDir: body.workingDir,
        envVars: body.envVars,
        autoDetected: false,
      },
    });

    res.json({ status: 'success', data: { config } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /run - Execute entire project using run config
// ---------------------------------------------------------------------------
runConfigRouter.post('/run', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const userId = req.user!.id;

    // Get project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { language: true, name: true },
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    // Get or auto-detect config
    let config = await prisma.runConfiguration.findUnique({
      where: { projectId },
    });

    if (!config) {
      // Auto-detect and save
      const detected = await detectProjectType(projectId);
      config = await prisma.runConfiguration.create({
        data: {
          projectId,
          projectType: detected.projectType,
          entryCommand: detected.entryCommand,
          buildCommand: detected.buildCommand || null,
          workingDir: detected.workingDir,
          envVars: {},
          autoDetected: true,
        },
      });
    }

    // Fetch all items to reconstruct full paths (e.g. templates/base.html)
    const allItems = await prisma.file.findMany({
      where: { projectId },
      select: { id: true, name: true, type: true, parentId: true, content: true },
    });

    const fileMap = new Map(allItems.map(f => [f.id, f]));
    const getRelativePath = (item: any): string => {
      let curr = item;
      const parts = [curr.name];
      while (curr.parentId && fileMap.has(curr.parentId)) {
        curr = fileMap.get(curr.parentId)!;
        parts.unshift(curr.name);
      }
      return parts.join('/');
    };

    const filesToExecute = allItems
      .filter(item => item.type === 'file')
      .map(item => ({
        name: getRelativePath(item),
        content: item.content,
      }));

    // Determine entry file from command for the existing execution engine
    let entryFileName = extractEntryFile(config.entryCommand, config.projectType);

    if (!entryFileName) {
      entryFileName = findDefaultEntryFile(filesToExecute.map(f => f.name), project.language);
    }

    // Match entry file within hierarchy if nested (e.g. student_management_system/app.py)
    if (entryFileName) {
      const match = filesToExecute.find(f => f.name === entryFileName || f.name.endsWith('/' + entryFileName));
      if (match) {
        entryFileName = match.name;
      }
    }

    if (!entryFileName) {
      throw new AppError(400, 'Could not determine entry file. Please configure a run command.', 'NO_ENTRY_FILE');
    }

    // Execute
    const startTime = Date.now();
    let result;
    try {
      result = await executeCode(project.language, filesToExecute, entryFileName);
    } catch (err: any) {
      throw new AppError(500, `Execution engine failure: ${err.message}`, 'EXEC_ENGINE_FAILURE');
    }

    // Determine status
    let status = 'completed';
    if (result.exitCode === 124) status = 'timeout';
    else if (result.exitCode !== 0) status = 'error';

    const limitString = (s: string, limit = 5000) =>
      s.length > limit ? s.substring(0, limit) + '... (truncated)' : s;

    // Save execution log
    const executionLog = await prisma.executionLog.create({
      data: {
        projectId,
        userId,
        language: project.language,
        entryFile: entryFileName,
        status,
        exitCode: result.exitCode,
        stdoutPreview: limitString(result.stdout),
        stderrPreview: limitString(result.stderr),
        durationMs: result.durationMs,
      },
    });

    res.json({
      status: 'success',
      data: {
        log: executionLog,
        fullStdout: result.stdout,
        fullStderr: result.stderr,
        command: config.entryCommand,
        projectType: config.projectType,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DetectedConfig {
  projectType: string;
  framework?: string;
  entryFile?: string;
  entryCommand: string;
  buildCommand: string | null;
  workingDir: string;
  confidence: 'high' | 'medium' | 'low';
}

async function detectProjectType(projectId: string): Promise<DetectedConfig> {
  const files = await prisma.file.findMany({
    where: { projectId, type: 'file' },
    select: { name: true, content: true },
  });

  const fileNames = files.map(f => f.name);
  const fileMap = new Map(files.map(f => [f.name, f.content || '']));

  // Check for package.json (Node.js & JS frameworks)
  if (fileNames.includes('package.json')) {
    try {
      const pkg = JSON.parse(fileMap.get('package.json') || '{}');
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};

      let framework = 'Node.js';
      if (deps['next']) framework = 'Next.js';
      else if (deps['react']) framework = 'React';
      else if (deps['express']) framework = 'Express.js';
      else if (deps['@nestjs/core']) framework = 'NestJS';
      else if (deps['fastify']) framework = 'Fastify';

      let command = 'node index.js';
      let entryFile = pkg.main || 'index.js';
      if (scripts.dev) command = 'npm run dev';
      else if (scripts.start) command = 'npm start';
      else if (pkg.main) command = `node ${pkg.main}`;

      return {
        projectType: 'nodejs',
        framework,
        entryFile,
        entryCommand: command,
        buildCommand: scripts.build ? 'npm run build' : null,
        workingDir: '/',
        confidence: 'high',
      };
    } catch {}
  }

  // Check for Python (requirements.txt / pyproject.toml / .py files)
  const hasPython = fileNames.some(f => f.endsWith('.py'));
  if (fileNames.includes('requirements.txt') || fileNames.includes('pyproject.toml') || hasPython) {
    const reqContent = fileMap.get('requirements.txt') || '';
    const allPyContent = files.filter(f => f.name.endsWith('.py')).map(f => f.content || '').join('\n');

    let framework = 'Python';
    if (/fastapi/i.test(reqContent) || /from\s+fastapi|import\s+fastapi/.test(allPyContent)) framework = 'FastAPI';
    else if (/flask/i.test(reqContent) || /from\s+flask|import\s+flask/.test(allPyContent)) framework = 'Flask';
    else if (/django/i.test(reqContent) || /django/.test(allPyContent)) framework = 'Django';

    let entryFile = 'main.py';
    if (fileNames.includes('app.py')) entryFile = 'app.py';
    else if (fileNames.includes('main.py')) entryFile = 'main.py';
    else if (fileNames.includes('manage.py')) entryFile = 'manage.py';
    else {
      const pyFile = fileNames.find(f => f.endsWith('.py'));
      if (pyFile) entryFile = pyFile;
    }

    let command = `python ${entryFile}`;
    if (framework === 'FastAPI' && fileNames.includes('main.py')) command = 'uvicorn main:app --reload';
    else if (framework === 'Django' && fileNames.includes('manage.py')) command = 'python manage.py runserver';

    return {
      projectType: 'python',
      framework,
      entryFile,
      entryCommand: command,
      buildCommand: null,
      workingDir: '/',
      confidence: fileNames.includes('requirements.txt') ? 'high' : 'medium',
    };
  }

  // Check for pom.xml / build.gradle (Java)
  const hasJava = fileNames.some(f => f.endsWith('.java'));
  if (fileNames.includes('pom.xml') || fileNames.includes('build.gradle') || hasJava) {
    const pomContent = fileMap.get('pom.xml') || '';
    let framework = 'Java';
    if (/spring-boot/i.test(pomContent)) framework = 'Spring Boot';

    const entry = fileNames.find(f => f === 'Main.java') || fileNames.find(f => f.endsWith('.java')) || 'Main.java';

    return {
      projectType: 'java',
      framework,
      entryFile: entry,
      entryCommand: framework === 'Spring Boot' ? 'mvn spring-boot:run' : 'mvn exec:java',
      buildCommand: 'mvn compile',
      workingDir: '/',
      confidence: fileNames.includes('pom.xml') ? 'high' : 'medium',
    };
  }

  // Fallback: detect from JS/TS file extensions
  const hasJS = fileNames.some(f => f.endsWith('.js') || f.endsWith('.ts'));
  if (hasJS) {
    const entry = fileNames.find(f => f === 'index.js') || fileNames.find(f => f.endsWith('.js') || f.endsWith('.ts')) || 'index.js';
    return {
      projectType: 'nodejs',
      framework: 'JavaScript',
      entryFile: entry,
      entryCommand: `node ${entry}`,
      buildCommand: null,
      workingDir: '/',
      confidence: 'low',
    };
  }

  return {
    projectType: 'custom',
    framework: 'Custom',
    entryCommand: 'echo "No entry point configured"',
    buildCommand: null,
    workingDir: '/',
    confidence: 'low',
  };
}

function extractEntryFile(command: string, projectType: string): string | null {
  // "python main.py" -> "main.py"
  const pythonMatch = command.match(/python\s+(\S+\.py)/);
  if (pythonMatch) return pythonMatch[1];

  // "node index.js" -> "index.js"
  const nodeMatch = command.match(/node\s+(\S+\.\w+)/);
  if (nodeMatch) return nodeMatch[1];

  // "java Main.java" -> "Main.java"
  const javaMatch = command.match(/java\s+(\S+\.java)/);
  if (javaMatch) return javaMatch[1];

  return null;
}

function findDefaultEntryFile(fileNames: string[], language: string): string | null {
  const defaults: Record<string, string[]> = {
    python: ['main.py', 'app.py', 'run.py', 'index.py'],
    javascript: ['index.js', 'app.js', 'server.js', 'main.js'],
    typescript: ['index.ts', 'app.ts', 'server.ts', 'main.ts'],
    java: ['Main.java', 'App.java'],
  };

  const candidates = defaults[language] || [];
  for (const candidate of candidates) {
    if (fileNames.includes(candidate)) return candidate;
  }

  // Fallback: first file of the right extension
  const extMap: Record<string, string> = {
    python: '.py', javascript: '.js', typescript: '.ts', java: '.java',
  };
  const ext = extMap[language];
  if (ext) {
    const found = fileNames.find(f => f.endsWith(ext));
    if (found) return found;
  }

  return fileNames[0] || null;
}
