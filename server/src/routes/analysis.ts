import { Router } from 'express';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectPermission } from '../middleware/role';
import { runSonarAnalysis } from '../services/sonarqube';
import { randomBytes } from 'crypto';

export const analysisRouter = Router({ mergeParams: true });

analysisRouter.use(requireAuth, requireProjectPermission('can_trigger_analysis'));

// ---------------------------------------------------------------------------
// POST - Trigger Static Code Analysis
// ---------------------------------------------------------------------------
analysisRouter.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const userId = req.user!.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { language: true }
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    // Fetch all files
    const allFiles = await prisma.file.findMany({
      where: { projectId, type: 'file' },
      select: { id: true, name: true, content: true }
    });

    if (allFiles.length === 0) {
      throw new AppError(400, 'Cannot analyze an empty project', 'BAD_REQUEST');
    }

    // We need a Version to link the analysis to. Create an auto-snapshot.
    const latestVersion = await prisma.version.findFirst({
      where: { projectId },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    const version = await prisma.version.create({
      data: {
        projectId,
        versionNumber: nextVersionNumber,
        name: `Auto-snapshot v${nextVersionNumber}`,
        message: 'Automated snapshot for analysis',
        createdById: userId,
        files: {
          create: allFiles.map((f: any) => ({
            filePath: f.name,
            content: f.content || '',
            sizeBytes: (f.content || '').length,
          }))
        }
      }
    });

    // Create the analysis record
    const analysis = await prisma.analysis.create({
      data: {
        projectId,
        versionId: version.id,
        triggeredById: userId,
        status: 'running',
        stage: 'sonar_scan',
        startedAt: new Date(),
      }
    });

    // Run SonarQube Scanner
    let sonarResults;
    try {
      sonarResults = await runSonarAnalysis(projectId, allFiles, project.language);
    } catch (err: any) {
      // Mark analysis as failed
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { status: 'failed', errorMessage: err.message, completedAt: new Date() }
      });
      throw new AppError(500, `Static Analysis Engine failure: ${err.message}`, 'ANALYSIS_ENGINE_FAILURE');
    }

    // Save metrics
    await prisma.analysisMetrics.create({
      data: {
        analysisId: analysis.id,
        complexity: sonarResults.metrics.complexity,
        cognitiveComplexity: sonarResults.metrics.cognitive_complexity,
        duplicatedLinesDensity: sonarResults.metrics.duplicated_lines_density,
        coverage: sonarResults.metrics.coverage,
        ncloc: sonarResults.metrics.ncloc,
      }
    });

    // Save code smells
    if (sonarResults.smells.length > 0) {
      await prisma.analysisSmell.createMany({
        data: sonarResults.smells.map(s => ({
          analysisId: analysis.id,
          ruleKey: s.rule,
          severity: s.severity,
          message: s.message,
          component: s.component,
          line: s.line,
        }))
      });
    }

    // Mark complete
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: 'completed', stage: null, completedAt: new Date() }
    });

    res.json({
      status: 'success',
      data: {
        analysisId: analysis.id,
        versionId: version.id,
        metrics: sonarResults.metrics,
        smellCount: sonarResults.smells.length
      },
      message: 'Static analysis completed successfully.'
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET - Analysis History
// ---------------------------------------------------------------------------
analysisRouter.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    const history = await prisma.analysis.findMany({
      where: { projectId },
      include: {
        metrics: true,
        version: { select: { versionNumber: true, name: true } },
        triggeredBy: { select: { displayName: true } },
        _count: { select: { smells: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ status: 'success', data: { history } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET - Smells for a specific Analysis
// ---------------------------------------------------------------------------
analysisRouter.get('/:analysisId/smells', async (req, res, next) => {
  try {
    const { analysisId } = req.params;

    const smells = await prisma.analysisSmell.findMany({
      where: { analysisId },
      orderBy: [{ severity: 'asc' }, { line: 'asc' }]
    });

    res.json({ status: 'success', data: { smells } });
  } catch (error) {
    next(error);
  }
});
