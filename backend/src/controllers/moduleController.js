const ModuleModel = require('../models/moduleModel');

async function listModules(req, res, next) {
  try {
    const filter = req.query.filter || 'all'; // all | free | premium
    const modules = await ModuleModel.listModules({ filter });
    res.json({ modules });
  } catch (err) {
    next(err);
  }
}

async function getModule(req, res, next) {
  try {
    const module = await ModuleModel.getBySlug(req.params.slug);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    // Gate premium content for non-premium users
    if (module.IsPremium && (!req.user || !req.user.isPremium) && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Premium subscription required', locked: true, module });
    }

    res.json({ module });
  } catch (err) {
    next(err);
  }
}

module.exports = { listModules, getModule };
