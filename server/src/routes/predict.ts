import { Router } from 'express';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectPermission } from '../middleware/role';
import axios from 'axios';
import { env } from '../config/env';

export const predictRouter = Router({ mergeParams: true });

predictRouter.use(requireAuth, requireProjectPermission('can_trigger_analysis'));

const mlClient = axios.create({
  baseURL: env.ML_WORKER_URL,
});

// ---------------------------------------------------------------------------
// POST - Trigger ML Defect-Risk Prediction for a given analysis
// ---------------------------------------------------------------------------
predictRouter.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { language: true }
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    if (project.language !== 'python') {
      throw new AppError(400, 'Defect-risk prediction is only supported for Python projects', 'UNSUPPORTED_LANGUAGE');
    }

    // Get latest completed analysis with metrics
    const latestAnalysis = await prisma.analysis.findFirst({
      where: { projectId, status: 'completed' },
      include: { metrics: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestAnalysis || !latestAnalysis.metrics) {
      throw new AppError(400, 'Run Static Code Analysis first to gather features for ML prediction', 'MISSING_FEATURES');
    }

    // Check if prediction already exists for this analysis
    const existingPrediction = await prisma.analysisPrediction.findUnique({
      where: { analysisId: latestAnalysis.id }
    });

    if (existingPrediction) {
      return res.json({
        status: 'success',
        data: { prediction: existingPrediction },
        message: 'Prediction already exists for the latest analysis.'
      });
    }

    // Construct Feature Vector — all 37 features the ML model expects
    const m = latestAnalysis.metrics;
    const features: Record<string, number> = {
      // SonarQube complexity metrics
      'COMPLEXITY': m.complexity || 0,
      'FILE_COMPLEXITY': m.complexity || 0,
      'CLASS_COMPLEXITY': m.complexity || 0,
      'FUNCTION_COMPLEXITY': m.cognitiveComplexity || 0,
      'COGNITIVE_COMPLEXITY': m.cognitiveComplexity || 0,

      // Coverage
      'COVERAGE': m.coverage || 0,
      'LINE_COVERAGE': m.coverage || 0,

      // Duplication
      'DUPLICATED_LINES': 0,
      'DUPLICATED_BLOCKS': 0,
      'DUPLICATED_FILES': 0,
      'DUPLICATED_LINES_DENSITY': m.duplicatedLinesDensity || 0,

      // Size metrics
      'CLASSES': 1,
      'FILES': 1,
      'DIRECTORIES': 1,
      'FUNCTIONS': Math.max(1, Math.floor((m.complexity || 1) / 3)),
      'STATEMENTS': m.ncloc || 0,
      'COMMENT_LINES': Math.floor((m.ncloc || 0) * 0.1),
      'COMMENT_LINES_DENSITY': 10,
      'LINES': m.ncloc || 0,
      'NCLOC': m.ncloc || 0,

      // Coupling (not tracked — defaults)
      'AFFERENT_COUPLINGS': 0,
      'EFFERENT_COUPLINGS': 0,
      'NUMBER_OF_CLASSES_AND_INTERFACES': 1,

      // Git-derived features (approximated)
      'PREVIOUS_COMMITS': 1,
      'COMMITS_LAST_30_DAYS': 1,
      'COMMITS_LAST_90_DAYS': 1,
      'LOG1P_LINES_ADDED': Math.log1p(m.ncloc || 0),
      'LOG1P_LINES_REMOVED': 0,
      'LOG1P_LINES_CHANGED': Math.log1p(m.ncloc || 0),
      'LOG1P_FILES_CHANGED': Math.log1p(1),

      // Smell features
      'ACTIVE_SMELLS': 0,
      'ACTIVE_SMELL_RULES': 0,
      'ACTIVE_SMELL_COMPONENTS': 0,
      'BLOCKER_SHARE': 0,
      'CRITICAL_SHARE': 0,
      'MAJOR_SHARE': 0,
      'MINOR_SHARE': 0,
    };

    // Get smell counts by severity for shares
    const smellCounts = await prisma.analysisSmell.groupBy({
      by: ['severity'],
      where: { analysisId: latestAnalysis.id },
      _count: { severity: true }
    });

    const totalSmells = smellCounts.reduce((sum: number, s: any) => sum + s._count.severity, 0);
    features['ACTIVE_SMELLS'] = totalSmells;

    // Count unique rules and components
    const uniqueRules = await prisma.analysisSmell.findMany({
      where: { analysisId: latestAnalysis.id },
      select: { ruleKey: true, component: true },
      distinct: ['ruleKey'],
    });
    features['ACTIVE_SMELL_RULES'] = uniqueRules.length;
    const uniqueComponents = new Set(uniqueRules.map((r: any) => r.component).filter(Boolean));
    features['ACTIVE_SMELL_COMPONENTS'] = uniqueComponents.size || 1;

    if (totalSmells > 0) {
      for (const s of smellCounts) {
        const share = s._count.severity / totalSmells;
        if (s.severity === 'BLOCKER') features['BLOCKER_SHARE'] = share;
        if (s.severity === 'CRITICAL') features['CRITICAL_SHARE'] = share;
        if (s.severity === 'MAJOR') features['MAJOR_SHARE'] = share;
        if (s.severity === 'MINOR') features['MINOR_SHARE'] = share;
      }
    }

    // Call ML Worker (with automatic public fallback and cold-start timeout)
    const targetUrl = env.ML_WORKER_URL.startsWith('http')
      ? `${env.ML_WORKER_URL}/predict`
      : `http://${env.ML_WORKER_URL}/predict`;

    let predictionResult;
    try {
      console.log(`[ML Predict] Calling ML Worker at: ${targetUrl}`);
      const mlRes = await axios.post(targetUrl, { features }, { timeout: 60000 });
      predictionResult = mlRes.data;
    } catch (err: any) {
      console.error(`[ML Predict] Primary call to ${targetUrl} failed:`, err.message);
      try {
        console.log('[ML Predict] Retrying with public ML Worker URL: https://codesync-ml.onrender.com/predict');
        const fallbackRes = await axios.post('https://codesync-ml.onrender.com/predict', { features }, { timeout: 60000 });
        predictionResult = fallbackRes.data;
      } catch (fallbackErr: any) {
        console.error('[ML Predict] Fallback call also failed:', fallbackErr.message);
        throw new AppError(503, `ML Prediction Service unavailable: ${fallbackErr.message}. Ensure the ml-worker is awake.`, 'ML_SERVICE_DOWN');
      }
    }

    // Determine risk level
    const prob = predictionResult.fault_probability;
    let riskLevel = 'low';
    if (prob > 0.7) riskLevel = 'high';
    else if (prob > 0.4) riskLevel = 'medium';

    // Save Prediction
    const prediction = await prisma.analysisPrediction.create({
      data: {
        analysisId: latestAnalysis.id,
        riskScore: prob,
        riskLevel,
        classifierUsed: 'HGB',
        featureVector: features,
        disclaimer: 'This prediction is based on a research model trained on Java projects from the Technical Debt dataset. Results for Python code are extrapolated and should be interpreted with caution. The model identifies statistical patterns in code metrics that correlate with historical fault introduction, not causal defects.',
      }
    });

    res.json({
      status: 'success',
      data: { prediction },
      message: 'Defect-risk prediction completed.'
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET - Get prediction for latest analysis
// ---------------------------------------------------------------------------
predictRouter.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    const latestAnalysis = await prisma.analysis.findFirst({
      where: { projectId, status: 'completed' },
      include: {
        prediction: true,
        metrics: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestAnalysis?.prediction) {
      return res.json({ status: 'success', data: { prediction: null } });
    }

    res.json({ status: 'success', data: { prediction: latestAnalysis.prediction, metrics: latestAnalysis.metrics } });
  } catch (error) {
    next(error);
  }
});
