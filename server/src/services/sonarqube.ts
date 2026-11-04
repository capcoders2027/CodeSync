import axios from 'axios';
import { env } from '../config/env';
import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// SonarQube API configuration
// In Docker Compose: SONARQUBE_URL=http://sonarqube:9000
// In local dev:      SONARQUBE_URL=http://localhost:9200
// Uses admin credentials for REST API polling (scanner uses SONARQUBE_TOKEN separately).
const getSonarApi = () => axios.create({
  baseURL: env.SONARQUBE_URL,
  auth: {
    username: 'admin',
    password: process.env.SONARQUBE_API_PASSWORD || 'admin',
  },
  timeout: 15000,
});

export interface SonarMetrics {
  bugs: number;
  vulnerabilities: number;
  code_smells: number;
  coverage: number;
  duplicated_lines_density: number;
  complexity: number;
  cognitive_complexity: number;
  ncloc: number;
}

export interface CodeSmellDetail {
  key: string;
  rule: string;
  severity: string;
  component: string;
  line: number;
  message: string;
  type: string;
}

export const runLocalStaticAnalysis = (
  files: { name: string; content: string | null }[],
  language: string
): { metrics: SonarMetrics; smells: CodeSmellDetail[] } => {
  let totalNcloc = 0;
  let totalComplexity = 0;
  const smells: CodeSmellDetail[] = [];

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');
    let fileNcloc = 0;
    let fileComplexity = 1;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const lineNum = idx + 1;

      if (!trimmed) return;

      const isComment = language === 'python'
        ? trimmed.startsWith('#')
        : trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');

      if (!isComment) {
        fileNcloc++;

        if (/\b(if|elif|else if|for|while|case|catch|except)\b/.test(trimmed)) {
          fileComplexity++;
        }
        if (/(&&|\|\|)/.test(trimmed)) {
          fileComplexity++;
        }

        // Code Smells
        if (language === 'python' && /\bprint\s*\(/.test(trimmed)) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_print`,
            rule: 'python:S106',
            severity: 'MINOR',
            component: file.name,
            line: lineNum,
            message: 'Standard outputs (print) should not be used in production code.',
            type: 'CODE_SMELL',
          });
        } else if ((language === 'javascript' || language === 'typescript') && /\bconsole\.(log|debug|info)\s*\(/.test(trimmed)) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_console`,
            rule: 'javascript:S106',
            severity: 'MINOR',
            component: file.name,
            line: lineNum,
            message: 'Standard outputs (console.log) should not be used in production code.',
            type: 'CODE_SMELL',
          });
        }

        if (/(password|secret|apikey|api_key|token)\s*[:=]\s*["'][^"']+["']/i.test(trimmed) && !trimmed.toLowerCase().includes('process.env')) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_secret`,
            rule: 'security:S2068',
            severity: 'CRITICAL',
            component: file.name,
            line: lineNum,
            message: 'Potential hardcoded credential or secret detected. Use environment variables instead.',
            type: 'VULNERABILITY',
          });
        }

        if (language === 'python' && /except.*:\s*pass\b/.test(trimmed)) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_pass`,
            rule: 'python:S1186',
            severity: 'MAJOR',
            component: file.name,
            line: lineNum,
            message: 'Avoid empty except blocks that silently swallow exceptions.',
            type: 'CODE_SMELL',
          });
        }

        const indentMatch = line.match(/^(\s+)/);
        if (indentMatch && indentMatch[1].length >= 16) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_nesting`,
            rule: 'complexity:S134',
            severity: 'MAJOR',
            component: file.name,
            line: lineNum,
            message: 'Control flow statement is nested too deeply (> 4 levels). Refactor into helper functions.',
            type: 'CODE_SMELL',
          });
        }
      } else {
        if (/\b(TODO|FIXME|HACK)\b/i.test(trimmed)) {
          smells.push({
            key: `smell_${file.name}_${lineNum}_todo`,
            rule: 'common:S1135',
            severity: 'INFO',
            component: file.name,
            line: lineNum,
            message: `Complete the task associated with this '${trimmed.match(/\b(TODO|FIXME|HACK)\b/i)?.[0]}' comment.`,
            type: 'CODE_SMELL',
          });
        }
      }
    });

    totalNcloc += fileNcloc;
    totalComplexity += fileComplexity;
  }

  return {
    metrics: {
      bugs: 0,
      vulnerabilities: smells.filter(s => s.type === 'VULNERABILITY').length,
      code_smells: smells.filter(s => s.type === 'CODE_SMELL').length,
      coverage: 0,
      duplicated_lines_density: 0,
      complexity: Math.max(1, totalComplexity),
      cognitive_complexity: Math.max(1, Math.floor(totalComplexity * 0.75)),
      ncloc: Math.max(1, totalNcloc),
    },
    smells,
  };
};

export const runSonarAnalysis = async (
  projectId: string,
  files: { name: string; content: string | null }[],
  language: string
): Promise<{ metrics: SonarMetrics; smells: CodeSmellDetail[] }> => {
  const runId = randomBytes(16).toString('hex');
  const projectKey = `codesync_${projectId}`;
  // In Docker Compose mode, SONAR_HOST_TMPDIR is the path inside the server
  // container that maps to the named volume codesync_sonar_tmp.
  // Spawned sonar-scanner containers reference that same named volume by name,
  // so the Docker daemon can resolve it even though it's container-internal.
  const baseDir = process.env.SONAR_HOST_TMPDIR || path.join(process.cwd(), '.tmp', 'sonar');
  const tempDir = path.join(baseDir, runId);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Write files
    for (const file of files) {
      if (file.content !== null) {
        const filePath = path.join(tempDir, file.name);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf8');
      }
    }

    // Create sonar-project.properties
    const sonarLang = language === 'python' ? 'py' : language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language;
    const properties = `
sonar.projectKey=${projectKey}
sonar.projectName=Project_${projectId}
sonar.projectVersion=1.0
sonar.sources=.
sonar.sourceEncoding=UTF-8
sonar.language=${sonarLang}
`;
    await fs.writeFile(path.join(tempDir, 'sonar-project.properties'), properties);

    // Run SonarScanner via Docker
    // When running in Docker Compose, SONARQUBE_URL points to the service name.
    // When running locally (dev), replace localhost with host.docker.internal for the scanner container.
    const sonarScannerUrl = env.SONARQUBE_URL.includes('localhost')
      ? env.SONARQUBE_URL.replace('localhost', 'host.docker.internal').replace(':9200', ':9000')
      : env.SONARQUBE_URL;

    const networkFlag = process.env.DOCKER_NETWORK ? `--network ${process.env.DOCKER_NETWORK}` : '';

    console.log('[SonarQube] Initiating scan for project key:', projectKey);
    console.log('[SonarQube] TempDir:', tempDir, 'RunId:', runId);
    console.log('[SonarQube] Scanner URL:', sonarScannerUrl);
    console.log('[SonarQube] Network flag:', networkFlag || '(none - local dev)');
    
    // We use process.env here directly because the Zod parsed env caches an empty string if dotenv runs late
    const token = process.env.SONARQUBE_TOKEN || env.SONARQUBE_TOKEN;

    let scannerCmd: string;
    if (process.env.SONAR_VOLUME_NAME) {
      // ── Docker Compose mode ──────────────────────────────────────────────
      // The server writes files into the named volume at /sonar_tmp/<runId>.
      // We mount the named volume by NAME and point sonar at the runId subdir.
      const volName = process.env.SONAR_VOLUME_NAME;
      scannerCmd = `docker run --rm ${networkFlag} -v "${volName}:/sonar_tmp" -w "/sonar_tmp/${runId}" sonarsource/sonar-scanner-cli sonar-scanner -Dsonar.host.url=${sonarScannerUrl} -Dsonar.login=${token}`;
    } else {
      // ── Local dev mode ───────────────────────────────────────────────────
      const mountPath = tempDir.replace(/\\/g, '/');
      const volumePrefix = mountPath.match(/^[a-zA-Z]:/) ? '/' + mountPath.replace(':', '') : mountPath;
      scannerCmd = `docker run --rm ${networkFlag} -v "${volumePrefix}:/usr/src" -w /usr/src sonarsource/sonar-scanner-cli sonar-scanner -Dsonar.host.url=${sonarScannerUrl} -Dsonar.login=${token}`;
    }
    console.log('[SonarQube] Running scanner cmd:', scannerCmd);
    try {
      await execAsync(scannerCmd, { timeout: 120000 });

      // Wait for Compute Engine to finish (up to 5 minutes: 60 × 5s)
      let analysisId = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const tasksRes = await getSonarApi().get(`/api/ce/component?component=${projectKey}`);
          const currentTask = tasksRes.data.current;
          if (currentTask && currentTask.status === 'SUCCESS') {
            analysisId = currentTask.analysisId;
            break;
          } else if (currentTask && currentTask.status === 'FAILED') {
            throw new Error('SonarQube Compute Engine task failed.');
          }
        } catch (e: any) {
          console.error('[SonarQube Polling Error]', e.message, e.response?.data || '');
        }
      }

      if (!analysisId) {
        throw new Error('SonarQube analysis timed out.');
      }

      // Fetch Metrics
      const metricsKeys = 'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,complexity,cognitive_complexity,ncloc';
      const metricsRes = await getSonarApi().get(`/api/measures/component?component=${projectKey}&metricKeys=${metricsKeys}`);
      
      const metricsList = metricsRes.data.component.measures;
      const metrics: Record<string, number> = {};
      for (const m of metricsList) {
        metrics[m.metric] = parseFloat(m.value);
      }

      // Fetch Code Smells (Issues)
      const issuesRes = await getSonarApi().get(`/api/issues/search?componentKeys=${projectKey}&types=CODE_SMELL&statuses=OPEN`);
      const issuesList = issuesRes.data.issues;

      const smells: CodeSmellDetail[] = issuesList.map((issue: any) => ({
        key: issue.key,
        rule: issue.rule,
        severity: issue.severity,
        component: issue.component.replace(`${projectKey}:`, ''),
        line: issue.line || 0,
        message: issue.message,
        type: issue.type,
      }));

      return {
        metrics: {
          bugs: metrics['bugs'] || 0,
          vulnerabilities: metrics['vulnerabilities'] || 0,
          code_smells: metrics['code_smells'] || 0,
          coverage: metrics['coverage'] || 0,
          duplicated_lines_density: metrics['duplicated_lines_density'] || 0,
          complexity: metrics['complexity'] || 0,
          cognitive_complexity: metrics['cognitive_complexity'] || 0,
          ncloc: metrics['ncloc'] || 0,
        },
        smells,
      };
    } catch (scannerErr: any) {
      console.log('[SonarQube] Docker scanner or SonarQube server unavailable on host. Running CodeSync native static code analysis engine fallback...');
      return runLocalStaticAnalysis(files, language);
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to cleanup sonar temp dir ${tempDir}`, e);
    }
  }
};
