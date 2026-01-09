'use client';

import React, { useState } from 'react';
import { useLeads } from '../context/LeadContext';
import type { Activity } from '../types/shared';

interface ActivityLoggerProps {
  leadId: string;
  onActivityAdded?: () => void;
  compact?: boolean;
}

const ActivityLogger = React.memo<ActivityLoggerProps>(function ActivityLogger({
  leadId,
  onActivityAdded,
  compact = false
}) {
  const { addActivity } = useLeads();
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState<Activity['activityType']>('note');
  const [duration, setDuration] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activityTypeOptions = [
    { value: 'call', label: '📞 Call', icon: '📞' },
    { value: 'email', label: '📧 Email', icon: '📧' },
    { value: 'meeting', label: '📅 Meeting', icon: '📅' },
    { value: 'follow_up', label: '🔔 Follow-up', icon: '🔔' },
    { value: 'note', label: '📝 Note', icon: '📝' },
    { value: 'other', label: '📊 Other', icon: '📊' },
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      alert('Please enter activity description');
      return;
    }

    setIsSubmitting(true);

    try {
      const durationNum = duration ? parseInt(duration, 10) : undefined;

      addActivity(leadId, trimmedDescription, {
        activityType,
        duration: durationNum
      });

      // Reset form
      setDescription('');
      setActivityType('note');
      setDuration('');

      // Call callback if provided
      if (onActivityAdded) {
        onActivityAdded();
      }

      // Success feedback could be added here (toast notification)
    } catch (error) {
      console.error('Error adding activity:', error);
      alert('Failed to add activity. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Activity Type Selector */}
      <div>
        <label className={`block font-medium text-gray-700 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`}>
          Activity Type
        </label>
        <select
          value={activityType}
          onChange={(e) => setActivityType(e.target.value as Activity['activityType'])}
          className={`w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-black ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
          disabled={isSubmitting}
          aria-label="Activity type"
        >
          {activityTypeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description Textarea */}
      <div>
        <label className={`block font-medium text-gray-700 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did you do? (e.g., Discussed pricing, Sent proposal, etc.)"
          rows={compact ? 2 : 3}
          className={`w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-black placeholder:text-gray-400 ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
          disabled={isSubmitting}
          required
        />
      </div>

      {/* Duration Input (Optional) */}
      <div>
        <label className={`block font-medium text-gray-700 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`}>
          Time spent (minutes) - Optional
        </label>
        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Optional"
          min="0"
          className={`w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-black placeholder:text-gray-400 ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
          disabled={isSubmitting}
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || !description.trim()}
        className={`w-full bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${compact ? 'py-1 text-sm' : 'py-2'}`}
      >
        {isSubmitting ? 'Adding...' : 'Add Activity'}
      </button>
    </form>
  );
});

ActivityLogger.displayName = 'ActivityLogger';

export default ActivityLogger;

