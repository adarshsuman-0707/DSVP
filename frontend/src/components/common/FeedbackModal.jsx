import { useState } from 'react';
import { submitFeedback } from '../../services/api';
import { Modal, FormField, Input, Textarea, Btn } from '../AdminDashboard/ui';

export default function FeedbackModal({ open, onClose }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }

    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    if (subject.length > 200) {
      setError('Subject must be 200 characters or less');
      return;
    }

    if (message.length > 2000) {
      setError('Message must be 2000 characters or less');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({ subject: subject.trim(), message: message.trim() });
      setSuccess(true);
      setSubject('');
      setMessage('');
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!submitting) {
      setSubject('');
      setMessage('');
      setError('');
      setSuccess(false);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send Feedback" width={540}>
      {success ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#4CAF50', marginBottom: 8 }}>
            Feedback Submitted!
          </h3>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Thank you for your feedback. We'll review it soon.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16,
              display: 'flex', gap: 8, alignItems: 'center',
            }}>⚠ {error}</div>
          )}

          <FormField label={`Subject (${subject.length}/200)`}>
            <Input
              value={subject}
              onChange={setSubject}
              placeholder="Brief description of your feedback"
              maxLength={200}
              disabled={submitting}
            />
          </FormField>

          <FormField label={`Message (${message.length}/2000)`}>
            <Textarea
              value={message}
              onChange={setMessage}
              placeholder="Tell us more about your experience, suggestions, or issues..."
              rows={6}
              maxLength={2000}
              disabled={submitting}
            />
          </FormField>

          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            paddingTop: 16, borderTop: '1px solid #e2e8f0',
          }}>
            <Btn variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Btn>
            <Btn variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}
