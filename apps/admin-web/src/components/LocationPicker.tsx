import { AimOutlined, EnvironmentFilled } from '@ant-design/icons';
import { Button } from 'antd';
import type { KeyboardEvent, MouseEvent } from 'react';
import { CAMPUS_CENTER_WGS84 } from '../constants/campus';

export interface MapLocation {
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (location: MapLocation) => void;
  centerLatitude?: number;
  centerLongitude?: number;
}

const LATITUDE_SPAN = 0.008;
const LONGITUDE_SPAN = 0.012;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isCoordinate(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function LocationPicker({
  latitude,
  longitude,
  onChange,
  centerLatitude = CAMPUS_CENTER_WGS84.latitude,
  centerLongitude = CAMPUS_CENTER_WGS84.longitude,
}: LocationPickerProps) {
  const selectedLatitude = isCoordinate(latitude) ? latitude as number : centerLatitude;
  const selectedLongitude = isCoordinate(longitude) ? longitude as number : centerLongitude;
  const markerLeft = clamp(
    50 + ((selectedLongitude - centerLongitude) / LONGITUDE_SPAN) * 100,
    2,
    98,
  );
  const markerTop = clamp(
    50 - ((selectedLatitude - centerLatitude) / LATITUDE_SPAN) * 100,
    2,
    98,
  );

  const pick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    onChange({
      latitude: Number((centerLatitude + (0.5 - y) * LATITUDE_SPAN).toFixed(6)),
      longitude: Number((centerLongitude + (x - 0.5) * LONGITUDE_SPAN).toFixed(6)),
    });
  };

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, MapLocation> = {
      ArrowUp: { latitude: 0.00005, longitude: 0 },
      ArrowDown: { latitude: -0.00005, longitude: 0 },
      ArrowLeft: { latitude: 0, longitude: -0.00005 },
      ArrowRight: { latitude: 0, longitude: 0.00005 },
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    onChange({
      latitude: Number((selectedLatitude + step.latitude).toFixed(6)),
      longitude: Number((selectedLongitude + step.longitude).toFixed(6)),
    });
  };

  return (
    <div className="location-picker">
      <div
        className="location-picker-map"
        role="button"
        tabIndex={0}
        aria-label="在校园示意地图上选择商家位置"
        onClick={pick}
        onKeyDown={nudge}
      >
        <span className="map-zone map-zone-north">东园餐饮区</span>
        <span className="map-zone map-zone-library">校园中心</span>
        <span className="map-zone map-zone-south">西园餐饮区</span>
        <span className="map-road map-road-horizontal" />
        <span className="map-road map-road-vertical" />
        <span
          className="location-marker"
          style={{ left: `${markerLeft}%`, top: `${markerTop}%` }}
          aria-hidden="true"
        >
          <EnvironmentFilled />
        </span>
        <span className="location-picker-scale">约 500 m</span>
      </div>
      <div className="location-picker-footer">
        <div>
          <strong>当前选点</strong>
          <span>{selectedLatitude.toFixed(6)}, {selectedLongitude.toFixed(6)} · WGS-84</span>
        </div>
        <Button
          size="small"
          icon={<AimOutlined />}
          aria-label="回到校园中心"
          onClick={() => onChange({ latitude: centerLatitude, longitude: centerLongitude })}
        >
          回到校园中心
        </Button>
      </div>
      <p>点击地图选点；聚焦地图后也可用方向键微调。选点会同步更新下方经纬度。</p>
    </div>
  );
}
