'use client';

import React from 'react';
import type { Activity } from '../types/shared';
import ActivityLogger from './ActivityLogger';

interface ActivityTimelineProps {
  activities: Activity[];
  onAddActivity?: (description: string) => void;
  leadId?: string;
}

const ActivityTimeline = React.memo(function ActivityTimeline({ activities = [], onAddActivity, leadId }: ActivityTimelineProps) {
  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get activity type icon
  const getActivityIcon = (type?: Activity['activityType']) => {
    const icons = {
      call: '📞',
      email: '📧',
      meeting: '📅',
      follow_up: '🔔',
      status_change: '🔄',
      edit: '✏️',
      created: '✨',
      note: '📝',
      other: '📊'
    };
    return icons[type || 'note'];
  };

  // Get activity type background color
  const getActivityBgColor = (type?: Activity['activityType']) => {
    const colors = {
      call: 'bg-blue-50',
      email: 'bg-green-50',
      meeting: 'bg-purple-50',
      follow_up: 'bg-orange-50',
      status_change: 'bg-yellow-50',
      edit: 'bg-gray-50',
      created: 'bg-pink-50',
      note: 'bg-gray-50',
      other: 'bg-gray-50'
    };
    return colors[type || 'note'];
  };

  return (
    <div className="space-y-4">
      {/* Add New Activity using ActivityLogger */}
      {onAddActivity && leadId && (
        <div className="mb-6">
          <ActivityLogger
            leadId={leadId}
            onActivityAdded={() => {/* Activity already added via context */ }}
            compact={true}
          />
        </div>
      )}

      {/* Activity List */}
      {activities && activities.length > 0 ? (
        activities.map((activity, index) => (
          <div key={activity.id} className="flex">
            <div className="mr-4 relative">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              {index < activities.length - 1 && (
                <div className="absolute top-3 bottom-0 left-1.5 -ml-px w-0.5 bg-gray-200"></div>
              )}
            </div>
            <div className="flex-grow pb-4">
              <div className={`rounded-lg p-3 ${getActivityBgColor(activity.activityType)}`}>
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getActivityIcon(activity.activityType)}</span>
                    <span className="text-sm text-gray-500">{formatDate(activity.timestamp)}</span>
                  </div>
                  {activity.duration && (
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                      {activity.duration} min
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-gray-900 mb-1">{activity.description}</p>

                {/* Footer Row - Employee Name */}
                {activity.employeeName && (
                  <p className="text-xs text-gray-500">by {activity.employeeName}</p>
                )}
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500">No activities recorded yet.</p>
      )}
    </div>
  );
});

ActivityTimeline.displayName = 'ActivityTimeline';

export default ActivityTimeline;