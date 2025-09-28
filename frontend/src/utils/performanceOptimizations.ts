/**
 * Performance optimization utilities for mining truck visualization
 * Includes spatial indexing, data chunking, and WebGL optimizations
 */

import { TruckData } from '@/types/truck'

// Spatial indexing for fast geographic queries
export class SpatialIndex {
  private grid: Map<string, TruckData[]> = new Map()
  private gridSize: number
  private bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  
  constructor(gridSize: number = 0.001) { // ~100m grid cells
    this.gridSize = gridSize
    this.bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity }
  }
  
  private getGridKey(lat: number, lon: number): string {
    const gridLat = Math.floor(lat / this.gridSize)
    const gridLon = Math.floor(lon / this.gridSize)
    return `${gridLat},${gridLon}`
  }
  
  insert(data: TruckData[]): void {
    this.grid.clear()
    
    for (const point of data) {
      if (point.lat != null && point.lon != null) {
        const key = this.getGridKey(point.lat, point.lon)
        
        if (!this.grid.has(key)) {
          this.grid.set(key, [])
        }
        this.grid.get(key)!.push(point)
        
        // Update bounds
        this.bounds.minLat = Math.min(this.bounds.minLat, point.lat)
        this.bounds.maxLat = Math.max(this.bounds.maxLat, point.lat)
        this.bounds.minLon = Math.min(this.bounds.minLon, point.lon)
        this.bounds.maxLon = Math.max(this.bounds.maxLon, point.lon)
      }
    }
  }
  
  queryRegion(minLat: number, maxLat: number, minLon: number, maxLon: number): TruckData[] {
    const result: TruckData[] = []
    
    const minGridLat = Math.floor(minLat / this.gridSize)
    const maxGridLat = Math.floor(maxLat / this.gridSize)
    const minGridLon = Math.floor(minLon / this.gridSize)
    const maxGridLon = Math.floor(maxLon / this.gridSize)
    
    for (let gridLat = minGridLat; gridLat <= maxGridLat; gridLat++) {
      for (let gridLon = minGridLon; gridLon <= maxGridLon; gridLon++) {
        const key = `${gridLat},${gridLon}`
        const points = this.grid.get(key)
        
        if (points) {
          for (const point of points) {
            if (point.lat! >= minLat && point.lat! <= maxLat &&
                point.lon! >= minLon && point.lon! <= maxLon) {
              result.push(point)
            }
          }
        }
      }
    }
    
    return result
  }
  
  getBounds() {
    return this.bounds
  }
}

// Level of Detail (LOD) system for performance
export class LODManager {
  private levels: { minZoom: number; maxZoom: number; simplification: number }[] = [
    { minZoom: 0, maxZoom: 10, simplification: 0.1 },   // Very simplified
    { minZoom: 10, maxZoom: 13, simplification: 0.3 },  // Simplified
    { minZoom: 13, maxZoom: 16, simplification: 0.7 },  // Moderate detail
    { minZoom: 16, maxZoom: 20, simplification: 1.0 }   // Full detail
  ]
  
  getSimplificationFactor(zoom: number): number {
    for (const level of this.levels) {
      if (zoom >= level.minZoom && zoom < level.maxZoom) {
        return level.simplification
      }
    }
    return 1.0 // Full detail for very high zoom
  }
  
  simplifyPath(points: TruckData[], factor: number): TruckData[] {
    if (factor >= 1.0) return points
    
    const step = Math.max(1, Math.floor(1 / factor))
    const simplified: TruckData[] = []
    
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i])
    }
    
    // Always include the last point
    if (points.length > 0 && simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1])
    }
    
    return simplified
  }
}

// Data chunking for smooth streaming
export class DataStreamer {
  private chunkSize: number
  private currentChunk: number = 0
  private chunks: TruckData[][] = []
  
  constructor(chunkSize: number = 1000) {
    this.chunkSize = chunkSize
  }
  
  chunk(data: TruckData[]): void {
    this.chunks = []
    this.currentChunk = 0
    
    for (let i = 0; i < data.length; i += this.chunkSize) {
      this.chunks.push(data.slice(i, i + this.chunkSize))
    }
  }
  
  getNextChunk(): TruckData[] | null {
    if (this.currentChunk >= this.chunks.length) {
      return null
    }
    return this.chunks[this.currentChunk++]
  }
  
  hasMoreChunks(): boolean {
    return this.currentChunk < this.chunks.length
  }
  
  reset(): void {
    this.currentChunk = 0
  }
  
  getProgress(): number {
    return this.chunks.length > 0 ? this.currentChunk / this.chunks.length : 1
  }
}

// Performance monitor
export class PerformanceMonitor {
  private frameCount: number = 0
  private startTime: number = performance.now()
  private lastFrameTime: number = performance.now()
  private frameTimes: number[] = []
  private maxFrameTimes: number = 60
  
  recordFrame(): void {
    const now = performance.now()
    const frameTime = now - this.lastFrameTime
    
    this.frameTimes.push(frameTime)
    if (this.frameTimes.length > this.maxFrameTimes) {
      this.frameTimes.shift()
    }
    
    this.frameCount++
    this.lastFrameTime = now
  }
  
  getFPS(): number {
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0
  }
  
  getAverageFrameTime(): number {
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
  }
  
  isPerformanceGood(): boolean {
    return this.getFPS() > 30 && this.getAverageFrameTime() < 33.33 // 30 FPS threshold
  }
  
  getStats() {
    const now = performance.now()
    const totalTime = now - this.startTime
    
    return {
      fps: this.getFPS(),
      avgFrameTime: this.getAverageFrameTime(),
      frameCount: this.frameCount,
      totalTime: totalTime,
      avgFPS: (this.frameCount / totalTime) * 1000
    }
  }
}

// Viewport-based culling
export function cullOutsideViewport(
  data: TruckData[],
  bounds: { north: number; south: number; east: number; west: number },
  buffer: number = 0.01 // Buffer around viewport
): TruckData[] {
  return data.filter(point => {
    if (point.lat == null || point.lon == null) return false
    
    return (
      point.lat >= bounds.south - buffer &&
      point.lat <= bounds.north + buffer &&
      point.lon >= bounds.west - buffer &&
      point.lon <= bounds.east + buffer
    )
  })
}

// Time-based data filtering for playback optimization
export function filterByTimeWindow(
  data: TruckData[],
  currentTime: number,
  windowSize: number = 60000 // 1 minute window
): TruckData[] {
  const startTime = currentTime - windowSize
  const endTime = currentTime + windowSize
  
  return data.filter(point => {
    const pointTime = new Date(point.timestamp).getTime()
    return pointTime >= startTime && pointTime <= endTime
  })
}

// Memory optimization utilities
export class MemoryManager {
  private cache: Map<string, any> = new Map()
  private maxCacheSize: number = 100
  private accessTimes: Map<string, number> = new Map()
  
  constructor(maxCacheSize: number = 100) {
    this.maxCacheSize = maxCacheSize
  }
  
  set(key: string, value: any): void {
    // Evict least recently used items if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const lru = this.getLRUKey()
      if (lru) {
        this.cache.delete(lru)
        this.accessTimes.delete(lru)
      }
    }
    
    this.cache.set(key, value)
    this.accessTimes.set(key, Date.now())
  }
  
  get(key: string): any {
    if (this.cache.has(key)) {
      this.accessTimes.set(key, Date.now())
      return this.cache.get(key)
    }
    return null
  }
  
  private getLRUKey(): string | null {
    let lruKey: string | null = null
    let lruTime = Infinity
    
    for (const [key, time] of Array.from(this.accessTimes.entries())) {
      if (time < lruTime) {
        lruTime = time
        lruKey = key
      }
    }
    
    return lruKey
  }
  
  clear(): void {
    this.cache.clear()
    this.accessTimes.clear()
  }
  
  getSize(): number {
    return this.cache.size
  }
}

// Debounced function for expensive operations
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttled function for high-frequency events
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// WebGL-ready data structures
export class WebGLDataBuffer {
  private vertices: Float32Array
  private colors: Float32Array
  private indices: Uint16Array
  private vertexCount: number = 0
  
  constructor(maxVertices: number = 10000) {
    this.vertices = new Float32Array(maxVertices * 2) // x, y coordinates
    this.colors = new Float32Array(maxVertices * 4)   // r, g, b, a
    this.indices = new Uint16Array(maxVertices)
  }
  
  addVertex(x: number, y: number, r: number, g: number, b: number, a: number = 1.0): void {
    if (this.vertexCount * 2 >= this.vertices.length) return // Buffer full
    
    const idx = this.vertexCount
    
    // Vertex position
    this.vertices[idx * 2] = x
    this.vertices[idx * 2 + 1] = y
    
    // Vertex color
    this.colors[idx * 4] = r
    this.colors[idx * 4 + 1] = g
    this.colors[idx * 4 + 2] = b
    this.colors[idx * 4 + 3] = a
    
    // Index
    this.indices[idx] = idx
    
    this.vertexCount++
  }
  
  clear(): void {
    this.vertexCount = 0
  }
  
  getVertices(): Float32Array {
    return this.vertices.subarray(0, this.vertexCount * 2)
  }
  
  getColors(): Float32Array {
    return this.colors.subarray(0, this.vertexCount * 4)
  }
  
  getIndices(): Uint16Array {
    return this.indices.subarray(0, this.vertexCount)
  }
  
  getVertexCount(): number {
    return this.vertexCount
  }
}