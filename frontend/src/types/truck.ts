export interface TruckDataPoint {
  timestamp: string;
  lat?: number;
  lon?: number;
  speed_ms?: number;
  speed_kmh?: number;
  offpath_error?: number;
  motion_controller?: string;
  asset_activity?: string;
  haulage_state?: string;
  notification_title?: string;
  notification_message?: string;
  altitude?: number;
  position_rms?: number;
}

export interface Truck {
  id: string;
  type: 'autonomous' | 'manual';
  data: TruckDataPoint[];
  data_points?: number;
}

export interface AlarmData {
  vehicle: string;
  timestamp: string;
  alarm_type: string;
  message: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  notification_title: string;
  location?: {
    lat: number;
    lon: number;
  };
  speed_at_alarm_kmh: number;
  offpath_error?: number;
  states: {
    motion_controller?: string;
    haulage_state?: string;
    asset_activity?: string;
  };
  session_id?: number;
  created_at?: string;
  raw_data?: any;
}

export interface ExtractedData {
  [truckId: string]: TruckDataPoint[];
}

export interface ExtractedDataMeta {
  alarms?: {
    [truckId: string]: AlarmData[];
  };
  metadata?: {
    userTimeRange?: {
      start: string; // Original user-entered start time
      end: string;   // Original user-entered end time
    };
    extractionTimeRange?: {
      start: string; // Actual data range start (may include extended state data)
      end: string;   // Actual data range end
    };
  };
}

export type ExtractedDataWithMeta = ExtractedData & ExtractedDataMeta;

// Type alias for consistency with component usage
export type TruckData = TruckDataPoint;

// Manual vehicle data interface
export interface ManualVehicleData {
  vehicle: string;
  timestamp: string;
  lat: number;
  lon: number;
  speed_ms?: number;
  speed_kmh?: number;
  altitude?: number;
  position_rms?: number;
}