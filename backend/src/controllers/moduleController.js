const ModuleModel = require('../models/moduleModel');

async function listModules(req, res, next) {
  try {
    const filter = req.query.filter || 'all'; // all | free | premium
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const userPlan = req.user?.subscriptionPlan || 'free';
    const premiumAccess = req.user?.premiumModulesAccess || [];
    
    const modules = await ModuleModel.listModules({ filter });
    
    // Add HasAccess flag to each module based on user's subscription
    const modulesWithAccess = modules.map(m => {
      // Admin always has full access
      if (userRole === 'admin') {
        return { ...m, HasAccess: true };
      }
      
      // Check RequiredPlan (strict enforcement)
      const requiredPlan = m.RequiredPlan || 'free';
      let hasAccess = false;
      
      if (requiredPlan === 'free') {
        // Free modules accessible to everyone
        hasAccess = true;
      } else if (requiredPlan === 'basic') {
        // Basic tier modules require basic or premium plan
        hasAccess = (userPlan === 'basic' || userPlan === 'premium');
      } else if (requiredPlan === 'premium') {
        // Premium tier modules ONLY for premium plan
        hasAccess = (userPlan === 'premium');
      }
      
      // For basic plan users, also check if module is in their access list
      if (userPlan === 'basic' && m.IsPremium && !premiumAccess.includes(m.ModuleId)) {
        hasAccess = false;
      }
      
      return { ...m, HasAccess: hasAccess };
    });
    
    res.json({ modules: modulesWithAccess });
  } catch (err) {
    next(err);
  }
}

async function getModule(req, res, next) {
  try {
    const module = await ModuleModel.getBySlug(req.params.slug);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    // Check if user has access to this module (STRICT enforcement)
    const userRole = req.user?.role;
    const userPlan = req.user?.subscriptionPlan || 'free';
    const premiumAccess = req.user?.premiumModulesAccess || [];
    const requiredPlan = module.RequiredPlan || 'free';
    
    let hasAccess = false;
    
    // Admin always has access
    if (userRole === 'admin') {
      hasAccess = true;
    } 
    // Free modules accessible to all
    else if (requiredPlan === 'free') {
      hasAccess = true;
    }
    // Basic tier requires basic or premium plan
    else if (requiredPlan === 'basic') {
      if (userPlan === 'basic') {
        // For basic plan, check if module is in their access list
        hasAccess = premiumAccess.includes(module.ModuleId);
      } else if (userPlan === 'premium') {
        hasAccess = true;
      }
    }
    // Premium tier ONLY for premium plan
    else if (requiredPlan === 'premium') {
      hasAccess = (userPlan === 'premium');
    }

    if (!hasAccess) {
      return res.status(403).json({ 
        message: `This module requires ${requiredPlan} plan`, 
        locked: true, 
        requiredPlan,
        currentPlan: userPlan,
        module 
      });
    }

    res.json({ module });
  } catch (err) {
    next(err);
  }
}

module.exports = { listModules, getModule };
