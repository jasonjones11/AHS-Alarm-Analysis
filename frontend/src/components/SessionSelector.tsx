'use client';

import React, { useState, useEffect } from 'react';

interface Session {
  session_id: string;
  extraction_start_time: string;
  extraction_end_time: string;
  status: string;
  influxdb_config: {
    host: string;
    port: number;
    database: string;
  };
  time_range: {
    start: string;
    end: string;
  };
  vehicles_extracted: number;
  records: {
    raw: number;
    combined: number;
  };
  duration_seconds: number;
  created_at: string;
}

interface SessionSelectorProps {
  selectedSession: string | null;
  onSessionChange: (sessionId: string | null) => void;
  onSessionDetails: (session: Session) => void;
  onClearSession: (sessionId: string) => void;
}

export default function SessionSelector({ 
  selectedSession, 
  onSessionChange, 
  onSessionDetails,
  onClearSession 
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://127.0.0.1:9500/sessions');
      if (!response.ok) {
        throw new Error(`Failed to load sessions: ${response.status}`);
      }
      
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async (sessionId: string) => {
    if (!confirm(`Are you sure you want to clear all data for session ${sessionId}?`)) {
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:9500/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to clear session: ${response.status}`);
      }
      
      onClearSession(sessionId);
      await loadSessions(); // Reload sessions list
      
      // If cleared session was selected, deselect it
      if (selectedSession === sessionId) {
        onSessionChange(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear session');
      console.error('Error clearing session:', err);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-AU', {
        timeZone: 'Australia/Perth',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return '0m 0s';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Extraction Sessions</h3>
        <div className="flex gap-2">
          <button
            onClick={loadSessions}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-300 px-3 py-2 rounded mb-4">
          Error: {error}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-gray-300 text-sm font-medium mb-2">
          Select Session:
        </label>
        <select
          value={selectedSession || ''}
          onChange={(e) => onSessionChange(e.target.value || null)}
          className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Sessions (Mixed Data)</option>
          {sessions.map((session) => (
            <option key={session.session_id} value={session.session_id}>
              {session.session_id} - {formatDateTime(session.created_at)} 
              ({session.vehicles_extracted || 0} vehicles, {(session.records?.combined || 0).toLocaleString()} records)
            </option>
          ))}
        </select>
      </div>

      {selectedSession && (
        <div className="bg-gray-700 rounded p-3 mb-4">
          <div className="flex justify-between items-center">
            <h4 className="text-white font-medium">Selected Session: {selectedSession}</h4>
            <button
              onClick={() => handleClearSession(selectedSession)}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            >
              Clear Session Data
            </button>
          </div>
          {sessions.find(s => s.session_id === selectedSession) && (
            <div className="mt-2 text-sm text-gray-300">
              <div>Status: <span className="text-green-400">{sessions.find(s => s.session_id === selectedSession)?.status}</span></div>
              <div>Vehicles: {sessions.find(s => s.session_id === selectedSession)?.vehicles_extracted || 0}</div>
              <div>Records: {(sessions.find(s => s.session_id === selectedSession)?.records?.combined || 0).toLocaleString()}</div>
              <div>Duration: {formatDuration(sessions.find(s => s.session_id === selectedSession)?.duration_seconds || 0)}</div>
            </div>
          )}
        </div>
      )}

      {showDetails && sessions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-white font-medium">All Sessions:</h4>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                className={`p-3 rounded border ${
                  selectedSession === session.session_id
                    ? 'bg-blue-900 border-blue-700'
                    : 'bg-gray-700 border-gray-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm">{session.session_id}</div>
                    <div className="text-gray-300 text-xs mt-1">
                      <div>Created: {formatDateTime(session.created_at)}</div>
                      <div>InfluxDB: {session.influxdb_config.host}:{session.influxdb_config.port}</div>
                      <div>Time Range: {formatDateTime(session.time_range.start)} - {formatDateTime(session.time_range.end)}</div>
                      <div>Vehicles: {session.vehicles_extracted || 0} | Records: {(session.records?.combined || 0).toLocaleString()}</div>
                      <div>Duration: {formatDuration(session.duration_seconds || 0)} | Status: 
                        <span className={session.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}>
                          {' '}{session.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => onSessionChange(session.session_id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Select
                    </button>
                    <button
                      onClick={() => onSessionDetails(session)}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => handleClearSession(session.session_id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && !loading && (
        <div className="text-gray-400 text-center py-4">
          No extraction sessions found. Run a data extraction to create a session.
        </div>
      )}
    </div>
  );
}