/**
 * API utilities for fetching truck data from DuckDB backend
 */

import { buildApiUrl, getApiTimeout } from '@/config/environment'

export interface TruckInfo {
  vehicle_id: string;
  vehicle_type: string;  // Backend returns this field
  data_points: number;   // Backend returns this field
  time_range: {
    start: string;
    end: string;
  };
  session_id?: string;   // Backend returns this field
  // Legacy fields for compatibility
  data_types?: Array<{type: string; points: number}>;
  total_points?: number;
  first_timestamp?: string;
  last_timestamp?: string;
}

export interface TrucksResponse {
  vehicles: TruckInfo[];  // Backend returns 'vehicles' not 'trucks'
  count: number;
  status: string;
  data_source: string;
}

export interface TruckDataPoint {
  vehicle: string;
  timestamp: string;
  lat: number | null;
  lon: number | null;
  speed_kmh: number;
  data_type: string;
  motion_controller?: string;
  asset_activity?: string;
  haulage_state?: string;
  offpath_error?: number | null;
  position_data?: string;
  states?: {
    motion_controller?: string;
    asset_activity?: string;
    haulage_state?: string;
  };
}

export interface AlarmData {
  vehicle: string;
  timestamp: string;
  notification_title: string;
  message: string;
  severity: string;
  alarm_type: string;
  location: {
    lat: number;
    lon: number;
  };
}

export interface BulkTruckInfo {
  vehicle_id: string;
  total_points: number;
  loaded_points: number;
  time_range: {
    start: string;
    end: string;
  };
  data: TruckDataPoint[];
  data_types: string[];
  vehicle_type: string;
}

export interface BulkTruckData {
  trucks: BulkTruckInfo[];
  count: number;
  total_points_loaded: number;
  limit_per_truck: number;
  status: string;
}

export interface ApiResponse<T> {
  data: T;
  status: string;
  count?: number;
  message?: string;
}

class ApiClient {
  private async fetchJson<T>(endpoint: string): Promise<T> {
    const url = buildApiUrl(endpoint)
    const timeout = getApiTimeout()
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    })
    
    // Race between fetch and timeout
    const response = await Promise.race([
      fetch(url),
      timeoutPromise
    ])
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Get list of all available trucks from DuckDB
   */
  async getTrucks(): Promise<TruckInfo[]> {
    console.log('🔍 Fetching trucks from backend API...');
    const response = await this.fetchJson<TrucksResponse>('/trucks');
    console.log('✅ Received trucks response from backend:', response);
    
    // Extract vehicles array and add computed fields for compatibility
    const trucks = response.vehicles.map(truck => ({
      ...truck,
      // Ensure all expected fields are available
      total_points: truck.data_points,  // Map data_points to total_points
      first_timestamp: truck.time_range?.start,
      last_timestamp: truck.time_range?.end
    }));
    
    console.log('✅ Processed trucks:', trucks);
    return trucks;
  }

  /**
   * Get trajectory data for a specific vehicle
   */
  async getVehicleData(vehicleId: string, limit?: number): Promise<TruckDataPoint[]> {
    console.log(`🔍 Fetching playback data for vehicle ${vehicleId} from backend...`);
    const endpoint = `/vehicles/${vehicleId}/playback${limit ? `?limit=${limit}` : ''}`;
    const response = await this.fetchJson<ApiResponse<TruckDataPoint[]>>(endpoint);
    console.log(`✅ Received ${response.data.length} playback data points for vehicle ${vehicleId}`);
    return response.data;
  }

  /**
   * Get combined data with state associations for a vehicle
   */
  async getVehicleCombinedData(vehicleId: string, limit?: number): Promise<TruckDataPoint[]> {
    console.log(`🔍 Fetching playback data for vehicle ${vehicleId} from backend (combined data uses same endpoint)...`);
    const endpoint = `/vehicles/${vehicleId}/playback${limit ? `?limit=${limit}` : ''}`;
    const response = await this.fetchJson<ApiResponse<TruckDataPoint[]>>(endpoint);
    console.log(`✅ Received ${response.data.length} playback data points for vehicle ${vehicleId}`);
    return response.data;
  }

  /**
   * Get alarm/notification data for a vehicle
   */
  async getVehicleAlarms(vehicleId: string): Promise<AlarmData[]> {
    console.log(`🔍 Fetching alarms for vehicle ${vehicleId} from backend...`);
    const response = await this.fetchJson<ApiResponse<AlarmData[]>>(`/vehicles/${vehicleId}/alarms`);
    console.log(`✅ Received ${response.data?.length || 0} alarms for vehicle ${vehicleId}`);
    return response.data || [];
  }

  /**
   * Get optimized 1-second snapshots for a vehicle
   */
  async getVehicleSnapshots(vehicleId: string): Promise<TruckDataPoint[]> {
    console.log(`🔍 Fetching snapshots for vehicle ${vehicleId} from backend...`);
    const response = await this.fetchJson<ApiResponse<TruckDataPoint[]>>(`/snapshots/${vehicleId}`);
    console.log(`✅ Received ${response.data.length} snapshots for vehicle ${vehicleId}`);
    return response.data;
  }

  /**
   * Health check for backend API
   */
  async healthCheck(): Promise<{ status: string; database: string }> {
    console.log('🔍 Checking backend API health...');
    const response = await this.fetchJson<{ status: string; database: string }>('/health');
    console.log('✅ Backend health:', response);
    return response;
  }

  /**
   * Get bulk truck data for all vehicles - optimized for 100+ trucks
   */
  async getBulkTruckData(limitPerTruck?: number): Promise<BulkTruckData> {
    console.log('🚛 Fetching bulk truck data from backend...');
    const endpoint = `/bulk/trucks${limitPerTruck ? `?limit_per_truck=${limitPerTruck}` : ''}`;
    const response = await this.fetchJson<BulkTruckData>(endpoint);
    console.log(`✅ Received bulk data for ${response.count} trucks, ${response.total_points_loaded} total points`);
    return response;
  }

  /**
   * Rebuild database schema to fix any inconsistencies
   */
  async rebuildSchema(): Promise<{ status: string; message: string }> {
    console.log('🔧 Rebuilding database schema...');
    const url = buildApiUrl('/rebuild-schema')
    const timeout = getApiTimeout()
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    })
    
    // Race between fetch and timeout
    const response = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }),
      timeoutPromise
    ])
    
    if (!response.ok) {
      throw new Error(`Schema rebuild failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Schema rebuilt successfully:', result);
    return result;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Helper functions for data transformation
export const transformTruckDataForMap = (data: TruckDataPoint[]) => {
  return data.map(point => ({
    // Core fields that frontend expects (from types/truck.ts)
    timestamp: point.timestamp,
    lat: point.lat ?? undefined, // Convert null to undefined for frontend compatibility
    lon: point.lon ?? undefined, // Convert null to undefined for frontend compatibility
    speed_kmh: point.speed_kmh,
    speed_ms: point.speed_kmh ? point.speed_kmh / 3.6 : undefined, // Convert to m/s
    
    // Extract states from nested structure or use direct fields
    motion_controller: point.states?.motion_controller || point.motion_controller,
    asset_activity: point.states?.asset_activity || point.asset_activity,
    haulage_state: point.states?.haulage_state || point.haulage_state,
    
    offpath_error: point.offpath_error ?? undefined, // Convert null to undefined
    
    // Additional fields for compatibility
    vehicle: point.vehicle, // Keep for identification
    data_type: point.data_type,
    position_data: point.position_data
  }));
};

export const isAutonomousVehicle = (vehicleId: string): boolean => {
  return vehicleId.startsWith('DT') || vehicleId.startsWith('CAT') || vehicleId.startsWith('Hitachi');
};

export const isManualVehicle = (vehicleId: string): boolean => {
  return !isAutonomousVehicle(vehicleId);
};