const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/authMiddleware');
const UserModel = require('../models/userModel');
const { sql, getPool } = require('../config/db');

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/profile - Update display name
router.patch('/profile', verifyToken, async (req, res, next) => {
  try {
    const { fullName } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: 'Full name is required' });
    }

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      return res.status(400).json({ message: 'Full name must be at least 2 characters' });
    }
    if (trimmed.length > 150) {
      return res.status(400).json({ message: 'Full name must be 150 characters or less' });
    }

    const pool = await getPool();
    await pool.request()
      .input('UserId',   sql.Int,            req.user.userId)
      .input('FullName', sql.NVarChar(150),   trimmed)
      .query(`
        UPDATE dbo.Users
        SET FullName = @FullName, UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId
      `);

    const updated = await UserModel.findById(req.user.userId);
    res.json({ message: 'Profile updated successfully', user: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/password - Change password
router.patch('/password', verifyToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ message: 'New password is too long' });
    }

    // Fetch current hash
    const pool = await getPool();
    const result = await pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query('SELECT PasswordHash FROM dbo.Users WHERE UserId = @UserId');

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { PasswordHash } = result.recordset[0];
    const match = await bcrypt.compare(currentPassword, PasswordHash);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Prevent same password
    const sameAsOld = await bcrypt.compare(newPassword, PasswordHash);
    if (sameAsOld) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.request()
      .input('UserId',       sql.Int,           req.user.userId)
      .input('PasswordHash', sql.NVarChar(255),  newHash)
      .query(`
        UPDATE dbo.Users
        SET PasswordHash = @PasswordHash, UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId
      `);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/feedback - Submit feedback
router.post('/feedback', verifyToken, async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required' });
    }

    if (subject.length > 200) {
      return res.status(400).json({ message: 'Subject must be 200 characters or less' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ message: 'Message must be 2000 characters or less' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Subject', sql.NVarChar(200), subject.trim())
      .input('Message', sql.NVarChar(sql.MAX), message.trim())
      .query(`
        INSERT INTO dbo.Feedback (UserId, Subject, Message, Status)
        OUTPUT INSERTED.FeedbackId, INSERTED.CreatedAt
        VALUES (@UserId, @Subject, @Message, 'open')
      `);

    res.status(201).json({ 
      message: 'Feedback submitted successfully',
      feedbackId: result.recordset[0].FeedbackId,
      createdAt: result.recordset[0].CreatedAt
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/code-history/save - Save code to history
router.post('/code-history/save', verifyToken, async (req, res, next) => {
  try {
    const { title, language, code, moduleSlug } = req.body;

    if (!title || !language || !code) {
      return res.status(400).json({ message: 'Title, language, and code are required' });
    }

    if (title.length > 200) {
      return res.status(400).json({ message: 'Title must be 200 characters or less' });
    }

    if (!['python', 'cpp', 'java', 'c', 'csharp'].includes(language)) {
      return res.status(400).json({ message: 'Invalid language' });
    }

    const pool = await getPool();
    
    // Get ModuleId from slug if provided
    let moduleId = null;
    if (moduleSlug) {
      const moduleResult = await pool.request()
        .input('Slug', sql.NVarChar(100), moduleSlug)
        .query('SELECT ModuleId FROM dbo.Modules WHERE Slug = @Slug');
      
      if (moduleResult.recordset.length > 0) {
        moduleId = moduleResult.recordset[0].ModuleId;
      }
    }

    const result = await pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .input('ModuleId', sql.Int, moduleId)
      .input('ModuleSlug', sql.NVarChar(100), moduleSlug || null)
      .input('Title', sql.NVarChar(200), title.trim())
      .input('Language', sql.VarChar(20), language)
      .input('Code', sql.NVarChar(sql.MAX), code)
      .query(`
        INSERT INTO dbo.SavedSnippets (UserId, ModuleId, ModuleSlug, Title, Language, Code, CreatedAt, UpdatedAt)
        OUTPUT INSERTED.SnippetId, INSERTED.CreatedAt
        VALUES (@UserId, @ModuleId, @ModuleSlug, @Title, @Language, @Code, SYSUTCDATETIME(), SYSUTCDATETIME())
      `);

    res.status(201).json({
      message: 'Code saved successfully',
      snippetId: result.recordset[0].SnippetId,
      createdAt: result.recordset[0].CreatedAt
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/code-history - List user's saved code
router.get('/code-history', verifyToken, async (req, res, next) => {
  try {
    const { moduleSlug, language, limit = 50 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));

    const pool = await getPool();
    let query = `
      SELECT TOP (@Limit)
        SnippetId, Title, Language, ModuleSlug, 
        CreatedAt, UpdatedAt,
        LEN(Code) AS CodeLength
      FROM dbo.SavedSnippets
      WHERE UserId = @UserId
    `;

    const request = pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Limit', sql.Int, limitNum);

    if (moduleSlug) {
      query += ' AND ModuleSlug = @ModuleSlug';
      request.input('ModuleSlug', sql.NVarChar(100), moduleSlug);
    }

    if (language) {
      query += ' AND Language = @Language';
      request.input('Language', sql.VarChar(20), language);
    }

    query += ' ORDER BY CreatedAt DESC';

    const result = await request.query(query);

    res.json({
      history: result.recordset,
      count: result.recordset.length
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/code-history/:id - Load specific saved code
router.get('/code-history/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const pool = await getPool();
    const result = await pool.request()
      .input('SnippetId', sql.Int, id)
      .input('UserId', sql.Int, req.user.userId)
      .query(`
        SELECT SnippetId, Title, Language, Code, ModuleSlug, CreatedAt, UpdatedAt
        FROM dbo.SavedSnippets
        WHERE SnippetId = @SnippetId AND UserId = @UserId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Code not found or access denied' });
    }

    res.json({ snippet: result.recordset[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/code-history/:id - Delete saved code
router.delete('/code-history/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const pool = await getPool();
    const result = await pool.request()
      .input('SnippetId', sql.Int, id)
      .input('UserId', sql.Int, req.user.userId)
      .query(`
        DELETE FROM dbo.SavedSnippets
        WHERE SnippetId = @SnippetId AND UserId = @UserId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Code not found or access denied' });
    }

    res.json({ message: 'Code deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
