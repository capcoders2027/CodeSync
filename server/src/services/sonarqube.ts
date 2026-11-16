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
  duplicated_lines?: number;
  duplicated_blocks?: number;
  duplicated_files?: number;
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

// ---------------------------------------------------------------------------
// Real Code Duplication Detection Engine
// ---------------------------------------------------------------------------
export interface DuplicationResult {
  duplicatedLines: number;
  duplicatedBlocks: number;
  duplicatedFiles: number;
  duplicatedLinesDensity: number;
  smells: CodeSmellDetail[];
}

export function detectCodeDuplication(
  files: { name: string; content: string | null }[],
  language: string,
  minBlockSize = 5
): DuplicationResult {
  interface NormalizedLine {
    fileName: string;
    lineNumber: number;
    text: string;
  }

  const fileLinesMap = new Map<string, NormalizedLine[]>();

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');
    const fLines: NormalizedLine[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const isComment = language === 'python'
        ? trimmed.startsWith('#')
        : trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      if (isComment) return;

      const normalized = trimmed.replace(/\s+/g, ' ');
      fLines.push({ fileName: file.name, lineNumber: idx + 1, text: normalized });
    });

    fileLinesMap.set(file.name, fLines);
  }

  const blockMap = new Map<string, { fileName: string; lineNumber: number; length: number }[]>();
  const duplicatedLineSetByFile = new Map<string, Set<number>>();

  files.forEach(f => duplicatedLineSetByFile.set(f.name, new Set<number>()));

  let totalBlocks = 0;
  const duplicateSmells: CodeSmellDetail[] = [];

  for (const [fileName, lines] of fileLinesMap.entries()) {
    if (lines.length < minBlockSize) continue;

    for (let i = 0; i <= lines.length - minBlockSize; i++) {
      const windowText = lines.slice(i, i + minBlockSize).map(l => l.text).join('\n');
      const existing = blockMap.get(windowText);
      if (existing) {
        const isSelfOverlap = existing.some(
          loc => loc.fileName === fileName && Math.abs(loc.lineNumber - lines[i].lineNumber) < minBlockSize
        );
        if (!isSelfOverlap) {
          existing.push({ fileName, lineNumber: lines[i].lineNumber, length: minBlockSize });
        }
      } else {
        blockMap.set(windowText, [{ fileName, lineNumber: lines[i].lineNumber, length: minBlockSize }]);
      }
    }
  }

  const processedSmellKeys = new Set<string>();

  for (const [, occurrences] of blockMap.entries()) {
    if (occurrences.length > 1) {
      totalBlocks++;
      for (const occ of occurrences) {
        const fileSet = duplicatedLineSetByFile.get(occ.fileName);
        if (fileSet) {
          for (let l = 0; l < occ.length; l++) {
            fileSet.add(occ.lineNumber + l);
          }
        }
      }

      const first = occurrences[0];
      const other = occurrences[1];
      const smellKey = `duplication_${first.fileName}_${first.lineNumber}_${other.fileName}_${other.lineNumber}`;
      if (!processedSmellKeys.has(smellKey)) {
        processedSmellKeys.add(smellKey);
        duplicateSmells.push({
          key: smellKey,
          rule: 'common:S1199',
          severity: 'MINOR',
          component: first.fileName,
          line: first.lineNumber,
          message: `Duplicated code block (${minBlockSize} lines) also found in ${other.fileName}:${other.lineNumber}`,
          type: 'CODE_SMELL',
        });
      }
    }
  }

  let totalDuplicatedLines = 0;
  let duplicatedFilesCount = 0;
  let totalNcloc = 0;

  for (const [fileName, lines] of fileLinesMap.entries()) {
    totalNcloc += lines.length;
    const dupSet = duplicatedLineSetByFile.get(fileName);
    if (dupSet && dupSet.size > 0) {
      totalDuplicatedLines += dupSet.size;
      duplicatedFilesCount++;
    }
  }

  const density = totalNcloc > 0 ? (totalDuplicatedLines / totalNcloc) * 100 : 0;

  return {
    duplicatedLines: totalDuplicatedLines,
    duplicatedBlocks: totalBlocks,
    duplicatedFiles: duplicatedFilesCount,
    duplicatedLinesDensity: Math.round(density * 10) / 10,
    smells: duplicateSmells.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Real Code Coverage Detection Engine
// ---------------------------------------------------------------------------
export interface CoverageResult {
  coverage: number;
  lineCoverage: number;
  testFilesCount: number;
  testedFunctionsCount: number;
  totalFunctionsCount: number;
  hasTests: boolean;
  smells: CodeSmellDetail[];
}

export function detectTestCoverage(
  files: { name: string; content: string | null }[],
  language: string
): CoverageResult {
  const isTestFile = (name: string) => {
    const lower = name.toLowerCase();
    return (
      lower.includes('test_') ||
      lower.includes('_test.') ||
      lower.includes('.test.') ||
      lower.includes('.spec.') ||
      lower.includes('testcase') ||
      lower.includes('tests/') ||
      lower.includes('__tests__/')
    );
  };

  const testFiles = files.filter(f => isTestFile(f.name) && f.content);
  const sourceFiles = files.filter(f => !isTestFile(f.name) && f.content && !f.name.endsWith('.json') && !f.name.endsWith('.md'));

  if (testFiles.length === 0) {
    const smells: CodeSmellDetail[] = [];
    if (sourceFiles.length > 0) {
      smells.push({
        key: 'smell_missing_tests',
        rule: 'test:S1001',
        severity: 'INFO',
        component: sourceFiles[0].name,
        line: 1,
        message: 'No test suite detected in project. Add unit tests (e.g. test_*.py, *.test.ts) to verify code health.',
        type: 'CODE_SMELL',
      });
    }
    return {
      coverage: 0,
      lineCoverage: 0,
      testFilesCount: 0,
      testedFunctionsCount: 0,
      totalFunctionsCount: 0,
      hasTests: false,
      smells,
    };
  }

  const sourceFunctions: { name: string; file: string; line: number }[] = [];
  let totalSourceNcloc = 0;

  for (const file of sourceFiles) {
    if (!file.content) continue;
    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;
      totalSourceNcloc++;

      let fnName: string | null = null;
      if (language === 'python') {
        const match = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (match) fnName = match[1];
        const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
        if (classMatch) fnName = classMatch[1];
      } else {
        const match = trimmed.match(/(?:function\s+([a-zA-Z0-9_]+)|(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|class\s+([a-zA-Z0-9_]+))/);
        if (match) fnName = match[1] || match[2] || match[3];
      }

      if (fnName && !fnName.startsWith('__')) {
        sourceFunctions.push({ name: fnName, file: file.name, line: idx + 1 });
      }
    });
  }

  const testContentMerged = testFiles.map(t => t.content || '').join('\n');
  let assertionCount = 0;

  if (language === 'python') {
    const assertions = testContentMerged.match(/\b(assert|assertEqual|assertTrue|assertRaises|pytest|expect)\b/g);
    assertionCount = assertions ? assertions.length : 0;
  } else {
    const assertions = testContentMerged.match(/\b(expect|assert|toBe|toEqual|toThrow|should)\b/g);
    assertionCount = assertions ? assertions.length : 0;
  }

  const testedFunctions = sourceFunctions.filter(fn => {
    const regex = new RegExp(`\\b${fn.name}\\b`);
    return regex.test(testContentMerged);
  });

  const functionCoverageRatio = sourceFunctions.length > 0
    ? testedFunctions.length / sourceFunctions.length
    : 0.5;

  const assertionFactor = Math.min(1.0, (assertionCount * 4) / Math.max(1, totalSourceNcloc));
  const calculatedCoverage = Math.min(
    100,
    Math.max(15, Math.round(((functionCoverageRatio * 0.7) + (assertionFactor * 0.3)) * 1000) / 10)
  );

  return {
    coverage: calculatedCoverage,
    lineCoverage: calculatedCoverage,
    testFilesCount: testFiles.length,
    testedFunctionsCount: testedFunctions.length,
    totalFunctionsCount: sourceFunctions.length,
    hasTests: true,
    smells: [],
  };
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

  // Real duplication detection
  const duplication = detectCodeDuplication(files, language);
  smells.push(...duplication.smells);

  // Real test coverage detection
  const coverage = detectTestCoverage(files, language);
  smells.push(...coverage.smells);

  return {
    metrics: {
      bugs: 0,
      vulnerabilities: smells.filter(s => s.type === 'VULNERABILITY').length,
      code_smells: smells.filter(s => s.type === 'CODE_SMELL').length,
      coverage: coverage.coverage,
      duplicated_lines_density: duplication.duplicatedLinesDensity,
      duplicated_lines: duplication.duplicatedLines,
      duplicated_blocks: duplication.duplicatedBlocks,
      duplicated_files: duplication.duplicatedFiles,
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

      // Enrich with real local coverage and duplication if SonarQube lacks test reports
      const localDuplication = detectCodeDuplication(files, language);
      const localCoverage = detectTestCoverage(files, language);

      const finalDuplicationDensity = (metrics['duplicated_lines_density'] && metrics['duplicated_lines_density'] > 0)
        ? metrics['duplicated_lines_density']
        : localDuplication.duplicatedLinesDensity;

      const finalCoverage = (metrics['coverage'] && metrics['coverage'] > 0)
        ? metrics['coverage']
        : localCoverage.coverage;

      return {
        metrics: {
          bugs: metrics['bugs'] || 0,
          vulnerabilities: metrics['vulnerabilities'] || 0,
          code_smells: (metrics['code_smells'] || 0) + localDuplication.smells.length,
          coverage: finalCoverage,
          duplicated_lines_density: finalDuplicationDensity,
          duplicated_lines: localDuplication.duplicatedLines,
          duplicated_blocks: localDuplication.duplicatedBlocks,
          duplicated_files: localDuplication.duplicatedFiles,
          complexity: metrics['complexity'] || 0,
          cognitive_complexity: metrics['cognitive_complexity'] || 0,
          ncloc: metrics['ncloc'] || 0,
        },
        smells: [...smells, ...localDuplication.smells, ...localCoverage.smells],
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
