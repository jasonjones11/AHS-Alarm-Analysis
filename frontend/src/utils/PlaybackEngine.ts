// playback-engine.ts
/**
 * High-Performance Mining Truck Playback Engine
 * 
 * Handles smooth animation of up to 50 trucks simultaneously with:
 * - requestAnimationFrame-based smooth animation
 * - Efficient interpolation between GPS points
 * - Memory-optimized data structures
 * - Event-driven architecture for position updates
 */

// TypeScript compatibility for WeakRef
declare global {
  interface WeakRefConstructor {
    new <T extends object>(target: T): WeakRef<T>;
  }
  
  interface WeakRef<T extends object> {
    deref(): T | undefined;
  }
  
  var WeakRef: WeakRefConstructor | undefined;
}

// --- FIX 5: Type Safety for Event Handlers ---
export type StateChangeHandler = (state: PlaybackState & { timestamp: string }) => void;
export type PositionUpdateHandler = (positions: TruckPosition[]) => void;
export type TimeUpdateHandler = (currentTime: number, timestamp: string) => void;
export type PlayStateChangeHandler = (isPlaying: boolean) => void;
export type SpeedChangeHandler = (speed: number) => void;

// Define a union type for all possible handlers if needed generically
type EventHandler = 
  | StateChangeHandler
  | PositionUpdateHandler
  | TimeUpdateHandler
  | PlayStateChangeHandler
  | SpeedChangeHandler;
// --- End FIX 5 ---

export interface PlaybackDataPoint {
  vehicle_id: string
  timestamp: string
  latitude: number
  longitude: number
  speed_kmh: number
  offpath_deviation?: number
  states?: {
    motion_controller?: string
    asset_activity?: string
    haulage_state?: string
  }
  notifications?: string
  position_data?: any
}

export interface TruckPosition {
  vehicle_id: string
  timestamp: string
  latitude: number
  longitude: number
  speed_kmh: number
  offpath_deviation?: number
  states?: {
    motion_controller?: string
    asset_activity?: string
    haulage_state?: string
  }
  interpolated?: boolean // Flag for interpolated positions
}

export interface PlaybackState {
  isPlaying: boolean
  currentTime: number // milliseconds from start of range
  playbackSpeed: number // 0.5, 1, 2, 4
  startTime: number
  endTime: number
  totalDuration: number
}

// PlaybackEvents interface is now primarily for constructor args, event emitter handles callbacks
export interface PlaybackEvents {
  onPositionUpdate: PositionUpdateHandler;
  onTimeUpdate: TimeUpdateHandler;
  onPlayStateChange: PlayStateChangeHandler;
  onSpeedChange: SpeedChangeHandler;
  // onStateChange is handled by the internal event emitter
}

export class PlaybackEngine {
  private truckData: Map<string, PlaybackDataPoint[]> = new Map()
  private state: PlaybackState
  private events: PlaybackEvents
  private animationFrame: number | null = null
  private lastFrameTime: number = 0
  private timeAccumulator: number = 0
  private updateCounter: number = 0

  // --- FIX 5 & 2: Typed Event Emitter Implementation ---
  private eventListeners: Map<string, EventHandler[]> = new Map();

  public on(event: 'stateChange', callback: StateChangeHandler): void;
  public on(event: 'positionUpdate', callback: PositionUpdateHandler): void;
  public on(event: 'timeUpdate', callback: TimeUpdateHandler): void;
  public on(event: 'playStateChange', callback: PlayStateChangeHandler): void;
  public on(event: 'speedChange', callback: SpeedChangeHandler): void;
  public on(event: string, callback: EventHandler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public off(event: 'stateChange', callback: StateChangeHandler): void;
  public off(event: 'positionUpdate', callback: PositionUpdateHandler): void;
  public off(event: 'timeUpdate', callback: TimeUpdateHandler): void;
  public off(event: 'playStateChange', callback: PlayStateChangeHandler): void;
  public off(event: 'speedChange', callback: SpeedChangeHandler): void;
  public off(event: string, callback: EventHandler) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: 'stateChange', data: PlaybackState & { timestamp: string }): void;
  private emit(event: 'positionUpdate', data: TruckPosition[]): void;
  private emit(event: 'timeUpdate', currentTime: number, timestamp: string): void;
  private emit(event: 'playStateChange', isPlaying: boolean): void;
  private emit(event: 'speedChange', speed: number): void;
  private emit(event: string, ...data: any[]) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          // This is a bit clunky due to variadic args, but works for known events
          if (event === 'stateChange' && data[0]) {
            (callback as StateChangeHandler)(data[0]);
          } else if (event === 'positionUpdate' && Array.isArray(data[0])) {
            (callback as PositionUpdateHandler)(data[0]);
          } else if (event === 'timeUpdate' && typeof data[0] === 'number' && typeof data[1] === 'string') {
            (callback as TimeUpdateHandler)(data[0], data[1]);
          } else if (event === 'playStateChange' && typeof data[0] === 'boolean') {
            (callback as PlayStateChangeHandler)(data[0]);
          } else if (event === 'speedChange' && typeof data[0] === 'number') {
            (callback as SpeedChangeHandler)(data[0]);
          } else {
             // Fallback for unknown event structure
             (callback as Function)(...data);
          }
        } catch (err) {
          console.error(`[PlaybackEngine] Error in listener for event '${event}':`, err);
        }
      });
    }
  }
  // --- End FIX 5 & 2 ---

  // --- FIX 1: Performance optimization - Pre-calculated time indices and sorted timestamps ---
  private timeIndices: Map<string, Map<number, number>> = new Map()
  private sortedTimestamps: Map<string, number[]> = new Map(); // FIX 1: Store sorted timestamps
  // --- End FIX 1 ---
  
  // Current interpolated positions for all trucks
  private currentPositions: Map<string, TruckPosition> = new Map()
  
  // Custom time range for playback (subset of total data)
  private customTimeRange: {start: number, end: number} | null = null

  // --- FIX 2: Memory Leak Prevention - Track active instances ---
  private static activeEngines: Set<WeakRef<PlaybackEngine>> = new Set();
  private static cleanupTimer: NodeJS.Timeout | null = null;
  private gcRef: WeakRef<PlaybackEngine> | null = null; // Hold a weak ref to self

  constructor(events: PlaybackEvents) {
    this.events = events
    this.state = {
      isPlaying: false,
      currentTime: 0,
      playbackSpeed: 1,
      startTime: 0,
      endTime: 0,
      totalDuration: 0
    }
    console.log('[PlaybackEngine] Initialized with events:', Object.keys(events))

    // --- FIX 2: Register this instance ---
    if (typeof WeakRef !== 'undefined') {
      this.gcRef = new WeakRef(this);
      PlaybackEngine.activeEngines.add(this.gcRef);
      // Periodically clean up orphaned references
      if (!PlaybackEngine.cleanupTimer) {
          PlaybackEngine.cleanupTimer = setInterval(() => {
              PlaybackEngine.cleanupOrphans();
          }, 30000); // Every 30 seconds
      }
    }
    // --- End FIX 2 ---
  }

  // --- FIX 2: Cleanup method for orphaned engines ---
  public static cleanupOrphans() {
      if (typeof WeakRef === 'undefined') return;
      
      console.log('[PlaybackEngine] Running periodic cleanup for orphaned engines.');
      const cleaned: WeakRef<PlaybackEngine>[] = [];
      for (const ref of PlaybackEngine.activeEngines) {
          const engine = ref.deref();
          if (!engine) {
              // Engine was garbage collected, remove the weak ref
              cleaned.push(ref);
          }
      }
      cleaned.forEach(ref => PlaybackEngine.activeEngines.delete(ref));
      console.log(`[PlaybackEngine] Cleaned up ${cleaned.length} orphaned references.`);
  }

  public static getActiveEngineCount(): number {
      // This is approximate as WeakRefs might not be cleaned up immediately
      return PlaybackEngine.activeEngines.size;
  }
  // --- End FIX 2 ---

  // Helper to emit state changes using the new event system - FIX: Add throttling to prevent emission storms
  private lastEmittedState: (PlaybackState & { timestamp: string }) | null = null
  private lastEmissionTime: number = 0
  private readonly EMISSION_THROTTLE_MS = 100  // Limit emissions to every 100ms

  private emitStateChangeEvent() {
    const now = performance.now()
    const stateWithTs = this.getStateWithTimestamp()
    
    // Throttle emissions to prevent excessive React re-renders
    if (now - this.lastEmissionTime < this.EMISSION_THROTTLE_MS) {
      return
    }
    
    // Deep comparison to prevent unnecessary emissions
    if (this.lastEmittedState) {
      const hasSignificantChange = (
        Math.abs(stateWithTs.currentTime - this.lastEmittedState.currentTime) > 500 || // 500ms tolerance
        stateWithTs.isPlaying !== this.lastEmittedState.isPlaying ||
        stateWithTs.playbackSpeed !== this.lastEmittedState.playbackSpeed ||
        stateWithTs.startTime !== this.lastEmittedState.startTime ||
        stateWithTs.endTime !== this.lastEmittedState.endTime
      )
      
      if (!hasSignificantChange) {
        return  // Skip emission if no significant change
      }
    }
    
    this.lastEmittedState = { ...stateWithTs }
    this.lastEmissionTime = now
    this.emit('stateChange', stateWithTs)
  }

  /**
   * Load truck data and prepare for playback
   */
  public loadTruckData(truckData: Map<string, PlaybackDataPoint[]>): void {
    console.log('[PlaybackEngine] Loading truck data:', {
      vehicleCount: truckData.size,
      vehicleIds: Array.from(truckData.keys()),
      dataSizes: Array.from(truckData.entries()).map(([id, data]) => ({ id, points: data.length }))
    })
    
    this.truckData = new Map(truckData)
    this.preprocessData() // <-- This will now also create sortedTimestamps
    this.calculateTimeRange()
    this.initializePositions()
    
    console.log('[PlaybackEngine] Initialization complete:', {
      vehiclesLoaded: this.truckData.size,
      vehicleIds: Array.from(this.truckData.keys()),
      timeRange: { start: this.state.startTime, end: this.state.endTime },
      duration: this.state.totalDuration,
      initialPositions: this.currentPositions.size,
      initialPositionIds: Array.from(this.currentPositions.keys())
    })
  }

  /**
   * Pre-process data for optimal playback performance
   */
  private preprocessData(): void {
    this.timeIndices.clear()
    this.sortedTimestamps.clear(); // FIX 1: Clear sorted timestamps

    for (const [vehicleId, dataPoints] of this.truckData) {
      const timeIndex = new Map<number, number>()
      
      // Sort data by timestamp and create time index
      dataPoints.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (isNaN(timeA) || isNaN(timeB)) {
            console.warn(`[PlaybackEngine] Invalid timestamp found for vehicle ${vehicleId}. Skipping point.`);
            return 0; // Keep relative order if one is invalid
        }
        return timeA - timeB;
      });
      
      dataPoints.forEach((point, index) => {
        const time = new Date(point.timestamp).getTime()
        // Handle potential invalid timestamps gracefully
        if (!isNaN(time)) {
            timeIndex.set(time, index);
        } else {
            console.warn(`[PlaybackEngine] Skipping invalid timestamp for vehicle ${vehicleId} at index ${index}:`, point.timestamp);
        }
      })
      
      this.timeIndices.set(vehicleId, timeIndex)

      // --- FIX 1: Pre-sort timestamps ---
      const sortedTs = Array.from(timeIndex.keys()).sort((a, b) => a - b);
      this.sortedTimestamps.set(vehicleId, sortedTs);
      // --- End FIX 1 ---
    }
  }

  /**
   * Calculate the overall time range across all trucks
   */
  private calculateTimeRange(): void {
    let minTime = Infinity
    let maxTime = -Infinity

    for (const dataPoints of this.truckData.values()) {
      if (dataPoints.length > 0) {
        const firstPoint = dataPoints[0];
        const lastPoint = dataPoints[dataPoints.length - 1];
        const firstTime = new Date(firstPoint.timestamp).getTime();
        const lastTime = new Date(lastPoint.timestamp).getTime();

        // Check for invalid timestamps
        if (isNaN(firstTime) || isNaN(lastTime)) {
            console.warn("[PlaybackEngine] Invalid timestamp found in data range calculation. Skipping vehicle data.");
            continue;
        }

        minTime = Math.min(minTime, firstTime)
        maxTime = Math.max(maxTime, lastTime)
      }
    }

    // Handle case where no valid data was found
    if (minTime === Infinity || maxTime === -Infinity) {
        console.warn("[PlaybackEngine] No valid timestamps found. Setting default time range.");
        minTime = 0;
        maxTime = 0;
    }

    this.state.startTime = minTime
    this.state.endTime = maxTime
    this.state.totalDuration = maxTime - minTime
    this.state.currentTime = 0
  }

  /**
   * Initialize all truck positions to their starting points
   */
  private initializePositions(): void {
    this.currentPositions.clear()

    for (const [vehicleId, dataPoints] of this.truckData) {
      if (dataPoints.length > 0) {
        const firstPoint = dataPoints[0]
        this.currentPositions.set(vehicleId, {
          vehicle_id: vehicleId,
          timestamp: firstPoint.timestamp,
          latitude: firstPoint.latitude,
          longitude: firstPoint.longitude,
          speed_kmh: firstPoint.speed_kmh,
          offpath_deviation: firstPoint.offpath_deviation,
          states: firstPoint.states,
          interpolated: false
        })
      }
    }

    // ✅ Emit initial positions
    this.events.onPositionUpdate(this.getCurrentPositions())
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
  }

  /**
   * Start playback animation
   */
  public play(): void {
    if (this.state.isPlaying) return

    console.log('[PlaybackEngine] Starting playback...')
    this.state.isPlaying = true
    this.lastFrameTime = performance.now()
    this.timeAccumulator = 0
    this.startAnimation()
    this.events.onPlayStateChange(true)

    // ✅ Emit positions when play starts
    this.events.onPositionUpdate(this.getCurrentPositions())
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
    
    console.log('[PlaybackEngine] Playback started successfully')
  }

  /**
   * Pause playback animation
   */
  public pause(): void {
    if (!this.state.isPlaying) return

    this.state.isPlaying = false
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.events.onPlayStateChange(false)
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
  }

  /**
   * Stop playback and reset to beginning
   */
  public stop(): void {
    this.pause() // Ensures animation is canceled

    // Reset to beginning
    this.state.currentTime = 0
    this.updatePositionsAtCurrentTime() // Updates internal positions

    const baseTime = this.customTimeRange ? this.customTimeRange.start : this.state.startTime
    const timestamp = new Date(baseTime).toISOString()
    this.events.onTimeUpdate(0, timestamp)

    // ✅ Emit final positions
    this.events.onPositionUpdate(this.getCurrentPositions())
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
  }

  /**
   * Set playback speed
   */
  public setPlaybackSpeed(speed: number): void {
    this.state.playbackSpeed = speed
    this.events.onSpeedChange(speed)
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
  }

  /**
   * Seek to specific time
   */
  public seekToTime(timeMs: number): void {
    const maxTime = this.customTimeRange 
      ? (this.customTimeRange.end - this.customTimeRange.start)
      : this.state.totalDuration
    
    this.state.currentTime = Math.max(0, Math.min(timeMs, maxTime))
    this.updatePositionsAtCurrentTime() // Updates positions and emits event
    
    const baseTime = this.customTimeRange ? this.customTimeRange.start : this.state.startTime
    const absoluteTime = baseTime + this.state.currentTime
    const timestamp = new Date(absoluteTime).toISOString()
    this.events.onTimeUpdate(this.state.currentTime, timestamp)
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
  }
  
  /**
   * Set custom playback time range (subset of total data)
   */
  public setTimeRange(startTime: number, endTime: number): void {
    if (startTime >= endTime) {
      console.warn('Invalid time range: start time must be before end time')
      return
    }
    
    // Clamp to valid range
    const clampedStart = Math.max(startTime, this.state.startTime)
    const clampedEnd = Math.min(endTime, this.state.endTime)
    
    this.customTimeRange = {start: clampedStart, end: clampedEnd}
    this.state.currentTime = 0
    this.state.totalDuration = clampedEnd - clampedStart
    this.updatePositionsAtCurrentTime()
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
    
    console.log(`[PlaybackEngine] Time range set: ${new Date(clampedStart).toISOString()} to ${new Date(clampedEnd).toISOString()} (${this.state.totalDuration}ms duration)`)
  }
  
  /**
   * Clear custom time range and use full dataset
   */
  public clearTimeRange(): void {
    this.customTimeRange = null
    this.state.currentTime = 0
    this.state.totalDuration = this.state.endTime - this.state.startTime
    this.updatePositionsAtCurrentTime()
    this.emitStateChangeEvent(); // <-- Use emitStateChangeEvent
    console.log('[PlaybackEngine] Time range cleared, using full dataset')
  }

  /**
   * Get current playback state
   */
  public getState(): PlaybackState {
    return { ...this.state }
  }

  /**
   * Get current playback state with timestamp for UI synchronization
   */
  public getStateWithTimestamp(): PlaybackState & { timestamp: string } {
    const baseTime = this.customTimeRange ? this.customTimeRange.start : this.state.startTime
    const absoluteTime = baseTime + this.state.currentTime
    const timestamp = new Date(absoluteTime).toISOString()
    
    return { 
      ...this.state,
      timestamp
    }
  }

  /**
   * Get current truck positions
   */
  public getCurrentPositions(): TruckPosition[] {
    return Array.from(this.currentPositions.values())
  }

  /**
   * Main animation loop - optimized for smooth 60fps performance
   */
  private startAnimation(): void {
    console.log('[PlaybackEngine] Starting animation loop')
    
    const animate = (currentTime: number) => {
      if (!this.state.isPlaying) {
        console.log('[PlaybackEngine] Animation stopped - not playing')
        return
      }

      // Guard against large time deltas (e.g., tab switching)
      const deltaTime = Math.min(currentTime - this.lastFrameTime, 100); 
      this.lastFrameTime = currentTime

      // Accumulate time with playback speed
      this.timeAccumulator += deltaTime * this.state.playbackSpeed

      // Update at ~60fps (every ~16.67ms)
      if (this.timeAccumulator >= 16.67) {
        const timeIncrement = this.timeAccumulator
        this.state.currentTime += timeIncrement
        this.timeAccumulator = 0

        const maxDuration = this.customTimeRange 
          ? (this.customTimeRange.end - this.customTimeRange.start)
          : this.state.totalDuration
        
        if (this.state.currentTime >= maxDuration) {
          this.state.currentTime = maxDuration
          this.pause()
        }

        // Update positions and emit
        this.updatePositionsAtCurrentTime()
        
        const baseTime = this.customTimeRange ? this.customTimeRange.start : this.state.startTime
        const absoluteTime = baseTime + this.state.currentTime
        const timestamp = new Date(absoluteTime).toISOString()
        
        this.events.onTimeUpdate(this.state.currentTime, timestamp)
        
        // EMIT STATE CHANGE EVENT for UI updates - but throttle it
        if (this.updateCounter % 2 === 0) { // Only emit every other update
          this.emitStateChangeEvent()
        }
      }

      this.animationFrame = requestAnimationFrame(animate)
    }

    this.animationFrame = requestAnimationFrame(animate)
  }

  /**
   * Update all truck positions for the current time with smooth interpolation
   */
  private updatePositionsAtCurrentTime(): void {
    const baseTime = this.customTimeRange ? this.customTimeRange.start : this.state.startTime
    const absoluteTime = baseTime + this.state.currentTime
    const updatedPositions: TruckPosition[] = []

    for (const [vehicleId, dataPoints] of this.truckData) {
      const position = this.interpolatePositionAtTime(vehicleId, dataPoints, absoluteTime)
      if (position) {
        // ✅ Always update and include (even if similar)
        this.currentPositions.set(vehicleId, position)
        updatedPositions.push(position)
      }
    }

    // ✅ Always emit positions during playback or seek
    if (updatedPositions.length > 0) {
      this.events.onPositionUpdate(updatedPositions)
    }

    // Enhanced logging for debugging multi-vehicle issues - use deterministic logging
    this.updateCounter = (this.updateCounter || 0) + 1
    if (updatedPositions.length > 0 && this.updateCounter % 20 === 0) { // Every 20th update
      console.log(`[PlaybackEngine] Updated ${updatedPositions.length} vehicles at ${new Date(absoluteTime).toISOString().slice(11,19)}`, {
        vehicleIds: updatedPositions.map(p => p.vehicle_id),
        totalVehiclesInEngine: this.truckData.size,
        engineVehicleIds: Array.from(this.truckData.keys())
      })
    }
  }

  /**
   * Enhanced interpolation with smooth movement - Optimized using pre-sorted timestamps
   */
  private interpolatePositionAtTime(
    vehicleId: string,
    dataPoints: PlaybackDataPoint[],
    targetTime: number
  ): TruckPosition | null {
    if (dataPoints.length === 0) return null

    // --- FIX 1: Optimized Lookup using pre-sorted timestamps ---
    const vehicleTimeIndex = this.timeIndices.get(vehicleId);
    const sortedTimestamps = this.sortedTimestamps.get(vehicleId); // FIX 1: Use pre-sorted array
    if (!vehicleTimeIndex || !sortedTimestamps) { // Check both
        console.warn(`[PlaybackEngine] Time index or sorted timestamps not found for vehicle ${vehicleId}`);
        return null;
    }

    let beforeIndex: number | undefined = undefined;
    let afterIndex: number | undefined = undefined;

    // Use binary search on the pre-sorted array for O(log n) lookup
    let low = 0;
    let high = sortedTimestamps.length - 1;
    let foundIndex = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midTime = sortedTimestamps[mid];

        if (midTime === targetTime) {
            foundIndex = mid;
            break;
        } else if (midTime < targetTime) {
            low = mid + 1;
            foundIndex = mid; // Keep track of the last smaller timestamp
        } else {
            high = mid - 1;
        }
    }

    // `foundIndex` is now the index of the largest timestamp <= targetTime
    if (foundIndex !== -1) {
        beforeIndex = vehicleTimeIndex.get(sortedTimestamps[foundIndex])!;
        if (beforeIndex < dataPoints.length - 1) {
            afterIndex = beforeIndex + 1;
        }
    }
    // --- End FIX 1 ---

    // Handle edge cases
    if (beforeIndex === undefined) {
      // Target time is before the first data point
      if (targetTime <= new Date(dataPoints[0].timestamp).getTime()) {
        const point = dataPoints[0];
        return {
          vehicle_id: vehicleId,
          timestamp: new Date(targetTime).toISOString(),
          latitude: point.latitude,
          longitude: point.longitude,
          speed_kmh: point.speed_kmh,
          offpath_deviation: point.offpath_deviation,
          states: point.states,
          interpolated: false
        };
      } else {
        // Target time is after the last data point - hold at last position
        const point = dataPoints[dataPoints.length - 1];
        return {
          vehicle_id: vehicleId,
          timestamp: new Date(targetTime).toISOString(),
          latitude: point.latitude,
          longitude: point.longitude,
          speed_kmh: point.speed_kmh,
          offpath_deviation: point.offpath_deviation,
          states: point.states,
          interpolated: false
        };
      }
    }

    // If we found a beforeIndex but no valid afterIndex (e.g., it's the last point)
    if (afterIndex === undefined) {
        const point = dataPoints[beforeIndex];
        return {
          vehicle_id: vehicleId,
          timestamp: new Date(targetTime).toISOString(),
          latitude: point.latitude,
          longitude: point.longitude,
          speed_kmh: point.speed_kmh,
          offpath_deviation: point.offpath_deviation,
          states: point.states,
          interpolated: false // Technically not interpolated if it's the last point
        };
    }

    // Perform interpolation between the found points
    const beforePoint = dataPoints[beforeIndex];
    const afterPoint = dataPoints[afterIndex];
    const beforeTime = new Date(beforePoint.timestamp).getTime();
    const afterTime = new Date(afterPoint.timestamp).getTime();

    // Handle potential division by zero or invalid times
    if (beforeTime === afterTime || isNaN(beforeTime) || isNaN(afterTime)) {
        console.warn(`[PlaybackEngine] Invalid timestamps for interpolation for vehicle ${vehicleId}. Using before point.`);
        return {
          vehicle_id: vehicleId,
          timestamp: new Date(targetTime).toISOString(),
          latitude: beforePoint.latitude,
          longitude: beforePoint.longitude,
          speed_kmh: beforePoint.speed_kmh,
          offpath_deviation: beforePoint.offpath_deviation,
          states: beforePoint.states,
          interpolated: false
        };
    }

    const rawProgress = (targetTime - beforeTime) / (afterTime - beforeTime);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress)); // Clamp to [0, 1]
    const smoothProgress = this.smoothStep(clampedProgress);

    return {
      vehicle_id: vehicleId,
      timestamp: new Date(targetTime).toISOString(),
      latitude: this.lerp(beforePoint.latitude, afterPoint.latitude, smoothProgress),
      longitude: this.lerp(beforePoint.longitude, afterPoint.longitude, smoothProgress),
      speed_kmh: this.lerp(beforePoint.speed_kmh, afterPoint.speed_kmh, clampedProgress), // Use clamped progress for speed
      offpath_deviation: beforePoint.offpath_deviation !== undefined && afterPoint.offpath_deviation !== undefined
        ? this.lerp(beforePoint.offpath_deviation, afterPoint.offpath_deviation, clampedProgress)
        : beforePoint.offpath_deviation || afterPoint.offpath_deviation,
      states: clampedProgress < 0.5 ? beforePoint.states : afterPoint.states, // Discrete states
      interpolated: clampedProgress > 0.01 && clampedProgress < 0.99 // Mark as interpolated if between points
    };
  }

  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress
  }

  private smoothStep(t: number): number {
    t = Math.max(0, Math.min(1, t))
    return t * t * (3 - 2 * t)
  }

  public getTruckAtPosition(lat: number, lng: number, tolerance: number = 0.001): TruckPosition | null {
    for (const position of this.currentPositions.values()) {
      const latDiff = Math.abs(position.latitude - lat)
      const lngDiff = Math.abs(position.longitude - lng)
      
      if (latDiff <= tolerance && lngDiff <= tolerance) {
        return position
      }
    }
    return null
  }

  public destroy(): void {
    console.log('[PlaybackEngine] Destroying engine instance.');
    this.pause(); // Stop animation loop
    this.truckData.clear();
    this.timeIndices.clear();
    this.sortedTimestamps.clear(); // FIX 1: Clear sorted timestamps
    this.currentPositions.clear();
    this.eventListeners.clear(); // Clear event listeners to prevent leaks
    this.customTimeRange = null;
    
    // FIX: Clear emission throttling state to prevent cross-instance pollution
    this.lastEmittedState = null
    this.lastEmissionTime = 0
    
    // Reset state to default values
    this.state = {
      isPlaying: false,
      currentTime: 0,
      playbackSpeed: 1,
      startTime: 0,
      endTime: 0,
      totalDuration: 0
    };
    // --- FIX 2: Remove this instance from the tracking set ---
    if (this.gcRef) {
      PlaybackEngine.activeEngines.delete(this.gcRef);
    }
    // --- End FIX 2 ---
  }
}

export default PlaybackEngine