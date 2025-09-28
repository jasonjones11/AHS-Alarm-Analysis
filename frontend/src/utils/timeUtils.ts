/**
 * Time utilities for Perth timezone handling
 */

/**
 * Format a UTC timestamp for display in Perth time
 * @param timestamp - ISO string timestamp from backend (UTC format)
 * @returns Formatted Perth local time string
 */
export function formatPerthTime(timestamp: string): string {
  const date = new Date(timestamp);
  
  // Convert UTC timestamp to Perth time for display
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format a UTC timestamp for display (short format) in Perth time
 * @param timestamp - ISO string timestamp from backend (UTC format)
 * @returns Short formatted Perth local time string
 */
export function formatPerthTimeShort(timestamp: string): string {
  const date = new Date(timestamp);
  
  // Convert UTC timestamp to Perth time for display
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Get current Perth local time formatted for datetime-local input
 * @returns YYYY-MM-DDTHH:MM format string in Perth time
 */
export function getCurrentPerthTimeForInput(): string {
  const now = new Date();
  
  // Get Perth time (browser handles AWST/AWDT)
  const perthTime = new Date(now.toLocaleString('en-US', {
    timeZone: 'Australia/Perth'
  }));
  
  // Format for datetime-local input
  return perthTime.toISOString().slice(0, 16);
}

/**
 * Check if current Perth time is in daylight saving (AWDT) or standard (AWST)
 * @returns Object with timezone info
 */
export function getPerthTimezoneInfo(): { 
  isDST: boolean; 
  abbreviation: string; 
  offset: string; 
} {
  const now = new Date();
  const january = new Date(now.getFullYear(), 0, 1);
  const july = new Date(now.getFullYear(), 6, 1);
  
  const janOffset = january.getTimezoneOffset();
  const julOffset = july.getTimezoneOffset();
  
  // Perth is in southern hemisphere, so DST is opposite
  const isDST = now.getTimezoneOffset() < Math.max(janOffset, julOffset);
  
  return {
    isDST,
    abbreviation: isDST ? 'AWDT' : 'AWST',
    offset: isDST ? 'UTC+9' : 'UTC+8'
  };
}

/**
 * Convert a local datetime-local input value to UTC timestamp for backend
 * This converts Perth local time (UTC+8) to UTC for InfluxDB queries
 * Works for both autonomous and manual truck queries
 * @param datetimeLocalValue - Value from datetime-local input (Perth time)
 * @returns ISO timestamp string in UTC format
 */
export function convertLocalInputToTimestamp(datetimeLocalValue: string): string {
  // Add seconds if not present
  const fullTimestamp = datetimeLocalValue.includes(':') && 
    datetimeLocalValue.split(':').length === 2 ? 
    datetimeLocalValue + ':00' : datetimeLocalValue;
  
  // Parse the input as Perth local time and convert to UTC
  // Perth is always UTC+8 (no daylight saving)
  
  // Step 1: Parse the timestamp as if it were UTC (to avoid browser timezone interpretation)
  const utcParsed = new Date(fullTimestamp + 'Z');
  
  // Step 2: The input represents Perth time, so we need to shift it to get the correct UTC time
  // Example: User enters 16:30 Perth time → should become 08:30 UTC (16:30 - 8 = 08:30)
  const PERTH_OFFSET_HOURS = 8;
  const correctUTC = new Date(utcParsed.getTime() - (PERTH_OFFSET_HOURS * 60 * 60 * 1000));
  
  // Return as ISO string with Z suffix for UTC
  return correctUTC.toISOString();
}