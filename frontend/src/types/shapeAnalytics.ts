// TypeScript interfaces for Shape Analytics functionality

export interface ShapeInfo {
  name: string
  type: string
  id: string
  geometry: any // GeoJSON geometry
  boundingBox: {
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
  }
}

export interface SpeedAnalyticsByShape {
  avg_speed: number
  max_speed: number
  min_speed: number
  total_points: number
  speed_distribution: {
    '0-10': number
    '10-20': number
    '20-30': number
    '30-40': number
    '40+': number
  }
}

export interface OffpathAnalyticsByShape {
  avg_offpath: number
  max_absolute_offpath: number
  total_points_with_offpath: number
  offpath_frequency: number // percentage of points with offpath data
  offpath_severity: {
    low: number    // < 1m
    medium: number // 1-5m  
    high: number   // > 5m
  }
}

export interface MotionControllerTimeByShape {
  [state: string]: {
    duration_seconds: number
    percentage: number
    point_count: number
  }
}

export interface DistanceAnalyticsByShape {
  total_distance_km: number
  entry_exit_count: number
  average_speed_in_shape: number
}

export interface DwellTimeByShape {
  total_time_seconds: number
  entry_count: number
  average_visit_duration_seconds: number
  max_continuous_time_seconds: number
}

export interface ShapeAnalyticsData {
  shape_name: string
  shape_type: string
  shape_id: string
  total_vehicle_points: number
  time_range: {
    first_entry: string | null
    last_exit: string | null
  }
  speed_analytics: SpeedAnalyticsByShape
  offpath_analytics: OffpathAnalyticsByShape
  motion_controller_time: MotionControllerTimeByShape
  distance_analytics: DistanceAnalyticsByShape
  dwell_time: DwellTimeByShape
}

export interface ShapeAnalyticsResult {
  vehicle_id: string
  vehicle_type: string
  total_shapes_analyzed: number
  total_points_processed: number
  processing_time_ms: number
  shapes: ShapeAnalyticsData[]
}

export interface ShapeAnalyticsProgress {
  current_vehicle: string
  vehicles_completed: number
  total_vehicles: number
  current_shape: string
  shapes_completed: number
  total_shapes: number
  points_processed: number
  total_points: number
  percentage: number
  estimated_remaining_ms: number
}

export interface ShapeAnalyticsConfig {
  enable_sampling: boolean
  sample_rate: number // 0.1 = every 10th point
  max_points_threshold: number // threshold for showing sampling option
  batch_size: number // points to process per batch
  enable_progress_updates: boolean
}