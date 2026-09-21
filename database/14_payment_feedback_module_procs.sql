/* =========================================================================
   14_payment_feedback_module_procs.sql
   Converts every remaining raw-SQL method in paymentModel.js,
   feedbackModel.js, and moduleModel.js to stored procedures.
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

/* ═══════════════ PAYMENT MODEL ═══════════════ */

IF OBJECT_ID('dbo.sp_GetPaymentTotalRevenue') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetPaymentTotalRevenue AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetPaymentTotalRevenue
AS
BEGIN
  SET NOCOUNT ON;
  SELECT ISNULL(SUM(Amount),0) AS total FROM dbo.Payments WHERE Status='success';
END
GO

IF OBJECT_ID('dbo.sp_FindPaymentById') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindPaymentById AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindPaymentById
  @PaymentId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.*, u.FullName, u.Email
  FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
  WHERE p.PaymentId = @PaymentId;
END
GO

IF OBJECT_ID('dbo.sp_FindPaymentByOrderId') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindPaymentByOrderId AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindPaymentByOrderId
  @ProviderOrderId NVARCHAR(150)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Payments WHERE ProviderOrderId = @ProviderOrderId;
END
GO

IF OBJECT_ID('dbo.sp_CountSuccessPaymentsForUser') IS NULL EXEC('CREATE PROCEDURE dbo.sp_CountSuccessPaymentsForUser AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_CountSuccessPaymentsForUser
  @UserId INT, @ExcludeId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS total FROM dbo.Payments
  WHERE UserId=@UserId AND Status='success'
    AND (@ExcludeId IS NULL OR PaymentId <> @ExcludeId);
END
GO

IF OBJECT_ID('dbo.sp_SetPaymentCoinRedemption') IS NULL EXEC('CREATE PROCEDURE dbo.sp_SetPaymentCoinRedemption AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_SetPaymentCoinRedemption
  @PaymentId INT, @CoinsRedeemed INT, @DiscountAmount DECIMAL(10,2)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Payments SET CoinsRedeemed=@CoinsRedeemed, DiscountAmount=@DiscountAmount WHERE PaymentId=@PaymentId;
END
GO

IF OBJECT_ID('dbo.sp_UpdatePaymentStatus') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpdatePaymentStatus AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpdatePaymentStatus
  @PaymentId INT, @Status VARCHAR(20), @ProviderPaymentId NVARCHAR(150) = NULL,
  @PaymentMethod NVARCHAR(30) = NULL, @FailureReason NVARCHAR(500) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Payments
  SET Status = @Status,
      ProviderPaymentId = COALESCE(@ProviderPaymentId, ProviderPaymentId),
      PaymentMethod = COALESCE(@PaymentMethod, PaymentMethod),
      FailureReason = @FailureReason,
      UpdatedAt = SYSUTCDATETIME()
  WHERE PaymentId = @PaymentId;
END
GO

IF OBJECT_ID('dbo.sp_HasProcessedWebhookEvent') IS NULL EXEC('CREATE PROCEDURE dbo.sp_HasProcessedWebhookEvent AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_HasProcessedWebhookEvent
  @RazorpayEventId NVARCHAR(150), @Found BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET @Found = 0;
  IF EXISTS (SELECT 1 FROM dbo.WebhookEvents WHERE RazorpayEventId = @RazorpayEventId) SET @Found = 1;
END
GO

/* Idempotent insert — the UNIQUE constraint on RazorpayEventId is the real
   guard against a duplicate webhook delivery; @Inserted tells the caller
   whether THIS call was the one that recorded it (vs. a redelivery). */
IF OBJECT_ID('dbo.sp_RecordWebhookEvent') IS NULL EXEC('CREATE PROCEDURE dbo.sp_RecordWebhookEvent AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_RecordWebhookEvent
  @RazorpayEventId NVARCHAR(150), @EventType VARCHAR(50), @Payload NVARCHAR(MAX) = NULL,
  @Inserted BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET @Inserted = 0;
  BEGIN TRY
    INSERT INTO dbo.WebhookEvents (RazorpayEventId, EventType, Payload)
    VALUES (@RazorpayEventId, @EventType, @Payload);
    SET @Inserted = 1;
  END TRY
  BEGIN CATCH
    -- THROW is SQL Server 2012+; this instance is 2008, so re-raise via
    -- RAISERROR with the original error's text/severity/state instead.
    IF ERROR_NUMBER() NOT IN (2627, 2601) -- unique constraint violation = duplicate delivery
    BEGIN
      DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
      DECLARE @ErrSeverity INT = ERROR_SEVERITY();
      DECLARE @ErrState INT = ERROR_STATE();
      RAISERROR(@ErrMsg, @ErrSeverity, @ErrState);
    END
  END CATCH
END
GO

/* ═══════════════ FEEDBACK MODEL ═══════════════ */

IF OBJECT_ID('dbo.sp_DeleteFeedback') IS NULL EXEC('CREATE PROCEDURE dbo.sp_DeleteFeedback AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_DeleteFeedback
  @FeedbackId INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM dbo.Feedback WHERE FeedbackId=@FeedbackId;
END
GO

IF OBJECT_ID('dbo.sp_UpdateFeedbackStatus') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpdateFeedbackStatus AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpdateFeedbackStatus
  @FeedbackId INT, @Status VARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;
  -- UserSeen=0 whenever admin changes status — the submitting user should
  -- be notified their feedback moved, not left to wonder.
  UPDATE dbo.Feedback SET Status=@Status, UserSeen=0 WHERE FeedbackId=@FeedbackId;
END
GO

IF OBJECT_ID('dbo.sp_SetFeedbackReply') IS NULL EXEC('CREATE PROCEDURE dbo.sp_SetFeedbackReply AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_SetFeedbackReply
  @FeedbackId INT, @AdminReply NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Feedback
  SET AdminReply = @AdminReply, RespondedAt = SYSUTCDATETIME(), UserSeen = 0
  WHERE FeedbackId = @FeedbackId;
END
GO

IF OBJECT_ID('dbo.sp_ListFeedbackForUser') IS NULL EXEC('CREATE PROCEDURE dbo.sp_ListFeedbackForUser AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_ListFeedbackForUser
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT FeedbackId, Subject, Message, Status, AdminReply, RespondedAt, UserSeen, CreatedAt
  FROM dbo.Feedback
  WHERE UserId = @UserId
  ORDER BY CreatedAt DESC;
END
GO

IF OBJECT_ID('dbo.sp_MarkFeedbackSeen') IS NULL EXEC('CREATE PROCEDURE dbo.sp_MarkFeedbackSeen AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_MarkFeedbackSeen
  @FeedbackId INT, @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  -- Scoped to the owning user — a user must never be able to mark (or even
  -- discover the existence of) someone else's feedback as seen.
  UPDATE dbo.Feedback SET UserSeen=1 WHERE FeedbackId=@FeedbackId AND UserId=@UserId;
END
GO

IF OBJECT_ID('dbo.sp_CountUnseenFeedbackForUser') IS NULL EXEC('CREATE PROCEDURE dbo.sp_CountUnseenFeedbackForUser AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_CountUnseenFeedbackForUser
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS total FROM dbo.Feedback WHERE UserId=@UserId AND UserSeen=0;
END
GO

/* ═══════════════ MODULE MODEL ═══════════════ */

/* @Filter: 'all' | 'free' | 'basic' | 'premium' — a single flag-driven
   proc instead of building dynamic WHERE clauses in JS. */
IF OBJECT_ID('dbo.sp_ListModules') IS NULL EXEC('CREATE PROCEDURE dbo.sp_ListModules AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_ListModules
  @Filter VARCHAR(20) = 'all'
AS
BEGIN
  SET NOCOUNT ON;
  SELECT ModuleId, Name, Slug, Category, Description, IsPremium, IconUrl, SortOrder, RequiredPlan
  FROM dbo.Modules
  WHERE IsActive = 1
    AND (@Filter = 'all' OR RequiredPlan = @Filter)
  ORDER BY SortOrder ASC;
END
GO

IF OBJECT_ID('dbo.sp_GetModuleBySlug') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetModuleBySlug AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetModuleBySlug
  @Slug NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Modules WHERE Slug = @Slug AND IsActive = 1;
END
GO
