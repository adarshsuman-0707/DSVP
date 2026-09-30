const ModuleModel = require('../models/moduleModel');
const UserModel = require('../models/userModel');
const CoinModel = require('../models/coinModel');

const PLAN_RANK = { free: 0, basic: 1, premium: 2 };

/**
 * A user's plan unlocks every module at or below its tier (free < basic <
 * premium) — that's the whole point of paying for a plan. `premiumAccess`
 * is an optional admin-granted allowlist for one-off module grants on top
 * of whatever plan the user has. `coinUnlockedIds` is the coin-store
 * equivalent — a temporary (7-day) grant a user bought with coins instead
 * of upgrading their plan — neither replaces the plan check.
 */
function hasModuleAccess({ userPlan, premiumAccess, coinUnlockedIds, module }) {
  // No admin bypass: admins are gated by their own plan like anyone else, so
  // plan changes can be verified from an admin login. Module management
  // lives in the admin panel, not the catalog.
  const requiredPlan = module.RequiredPlan || 'free';
  const byPlan = (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
  const byGrant = premiumAccess.includes(module.ModuleId);
  const byCoins = coinUnlockedIds.has(module.ModuleId);
  return byPlan || byGrant || byCoins;
}

async function listModules(req, res, next) {
  try {
    const filter = req.query.filter || 'all'; // all | free | premium
    const userRole = req.user?.role;
    const userPlan = req.user?.subscriptionPlan || 'free';
    const premiumAccess = req.user?.premiumModulesAccess || [];

    const [modules, coinUnlocks] = await Promise.all([
      ModuleModel.listModules({ filter }),
      req.user?.userId ? CoinModel.getActiveModuleUnlocks(req.user.userId) : Promise.resolve([]),
    ]);
    const coinUnlockedIds = new Set(coinUnlocks.map(u => u.ModuleId));

    const modulesWithAccess = modules.map(m => ({
      ...m,
      HasAccess: hasModuleAccess({ userRole, userPlan, premiumAccess, coinUnlockedIds, module: m }),
      CoinUnlockExpiresAt: coinUnlocks.find(u => u.ModuleId === m.ModuleId)?.ExpiresAt || null,
    }));

    res.json({ modules: modulesWithAccess });
  } catch (err) {
    next(err);
  }
}

async function getModule(req, res, next) {
  try {
    const module = await ModuleModel.getBySlug(req.params.slug);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    const userRole = req.user?.role;
    const userPlan = req.user?.subscriptionPlan || 'free';
    const premiumAccess = req.user?.premiumModulesAccess || [];
    const requiredPlan = module.RequiredPlan || 'free';

    const coinUnlocks = req.user?.userId ? await CoinModel.getActiveModuleUnlocks(req.user.userId) : [];
    const coinUnlockedIds = new Set(coinUnlocks.map(u => u.ModuleId));

    if (!hasModuleAccess({ userRole, userPlan, premiumAccess, coinUnlockedIds, module })) {
      return res.status(403).json({
        message: `This module requires ${requiredPlan} plan`,
        locked: true,
        requiredPlan,
        currentPlan: userPlan,
        module
      });
    }

    if (req.user?.userId) {
      UserModel.logEvent(req.user.userId, 'module_viewed', { moduleId: module.ModuleId, slug: module.Slug }).catch(() => {});
    }

    res.json({ module });
  } catch (err) {
    next(err);
  }
}

module.exports = { listModules, getModule };
