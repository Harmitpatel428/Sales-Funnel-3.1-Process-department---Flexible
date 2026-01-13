'use client';

import React, { useState } from 'react';
import type { Activity } from '../types/shared';
import ActivityLogger from './ActivityLogger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EmailThreadView from './EmailThreadView';

interface ActivityTimelineProps {
  activities: Activity[];
  onAddActivity?: (description: string) => void;
  leadId?: string;
}

const ActivityTimeline = React.memo(function ActivityTimeline({ activities = [], onAddActivity, leadId }: ActivityTimelineProps) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Activity | null>(null);

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
    const icons: any = {
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
    return icons[type || 'note'] || icons['other'];
  };

  // Get activity type background color
  const getActivityBgColor = (type?: Activity['activityType']) => {
    const colors: any = {
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
    return colors[type || 'note'] || colors['other'];
  };

  const handleActivityClick = (activity: Activity) => {
    if (activity.activityType === 'email' && activity.metadata?.emailId) {
      setSelectedEmailId(activity.metadata.emailId);
    } else if (activity.activityType === 'meeting') {
      setSelectedEvent(activity);
    }
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
              <div
                className={`rounded-lg p-3 ${getActivityBgColor(activity.activityType)} cursor-pointer hover:opacity-90`}
                onClick={() => handleActivityClick(activity)}
              >
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

      {/* Modals */}
      <Dialog open={!!selectedEmailId} onOpenChange={(open) => !open && setSelectedEmailId(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          {selectedEmailId && <EmailThreadView threadId={selectedEmailId} onClose={() => setSelectedEmailId(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meeting Details</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <h3 className="font-bold">{selectedEvent?.description}</h3>
            <p className="text-sm text-gray-500">{formatDate(selectedEvent?.timestamp || '')}</p>
            {/* Additional event details if stored in metadata */}
            {selectedEvent?.metadata && (
              <div className="mt-4 text-sm">
                {JSON.stringify(selectedEvent.metadata, null, 2)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

ActivityTimeline.displayName = 'ActivityTimeline';

export default ActivityTimeline;