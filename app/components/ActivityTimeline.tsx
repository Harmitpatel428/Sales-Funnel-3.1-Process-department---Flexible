'use client';

import { useState } from 'react';
import type { Activity } from '../types/shared';

interface ActivityTimelineProps {
  activities: Activity[];
  onAddActivity?: (description: string) => void;
}

export default function ActivityTimeline({ activities = [], onAddActivity }: ActivityTimelineProps) {
  const [newActivity, setNewActivity] = useState('');
  
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
  
  // Handle add activity
  const handleAddActivity = () => {
    if (!newActivity.trim() || !onAddActivity) return;
    
    onAddActivity(newActivity);
    setNewActivity('');
  };
  
  return (
    <div className="space-y-4">
      {/* Add New Activity (if callback provided) */}
      {onAddActivity && (
        <div className="mb-6 flex">
          <input
            type="text"
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            placeholder="Add a new activity or note..."
            className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
          />
          <button
            onClick={handleAddActivity}
            className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
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
              <p className="text-sm text-gray-500">{formatDate(activity.timestamp)}</p>
              <p className="text-gray-900">{activity.description}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500">No activities recorded yet.</p>
      )}
    </div>
  );
}