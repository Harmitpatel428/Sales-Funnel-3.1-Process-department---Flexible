"use client";

import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay?: boolean;
}

interface CalendarIntegrationProps {
    leadId?: string;
    caseId?: string;
}

export default function CalendarIntegration({ leadId, caseId }: CalendarIntegrationProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newEvent, setNewEvent] = useState({ title: '', startTime: '', endTime: '', description: '' });
    const [selectedDate, setSelectedDate] = useState<{ start: Date, end: Date } | null>(null);

    useEffect(() => {
        fetchEvents();
    }, [leadId, caseId]);

    const fetchEvents = async () => {
        const query = new URLSearchParams();
        if (leadId) query.set('leadId', leadId);
        if (caseId) query.set('caseId', caseId);

        try {
            const res = await fetch(`/api/calendar/events?${query.toString()}`);
            const data = await res.json();
            if (res.ok) {
                setEvents(data.map((e: any) => ({
                    id: e.id,
                    title: e.title,
                    start: e.startTime,
                    end: e.endTime,
                    allDay: e.allDay
                })));
            }
        } catch (error) {
            console.error("Failed to fetch events", error);
        }
    };

    const handleDateSelect = (selectInfo: any) => {
        setSelectedDate({ start: selectInfo.start, end: selectInfo.end });
        setNewEvent({ ...newEvent, startTime: selectInfo.startStr, endTime: selectInfo.endStr });
        setIsModalOpen(true);
    };

    const handleEventClick = (clickInfo: any) => {
        toast.info(`Event: ${clickInfo.event.title}`);
        // Could open detail/edit modal
    };

    const handleCreateEvent = async () => {
        try {
            const res = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newEvent,
                    leadId,
                    caseId,
                    startTime: selectedDate?.start.toISOString(),
                    endTime: selectedDate?.end.toISOString()
                })
            });

            if (res.ok) {
                toast.success('Event created');
                setIsModalOpen(false);
                fetchEvents();
            } else {
                toast.error('Failed to create event');
            }
        } catch (error) {
            toast.error('Error creating event');
        }
    };

    return (
        <div className="h-full p-4 bg-white rounded-lg shadow">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                weekends={true}
                events={events} // items
                select={handleDateSelect}
                eventClick={handleEventClick}
                height="auto"
            />

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Event</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Title</Label>
                            <Input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Input value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateEvent}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
