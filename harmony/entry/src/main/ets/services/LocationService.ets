import { abilityAccessCtrl, bundleManager, common, Permissions } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { geoLocationManager } from '@kit.LocationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from './DeviceStatus';

const APPROXIMATE_LOCATION: Permissions = 'ohos.permission.APPROXIMATELY_LOCATION';
const LOCATION_SWITCH_OFF = 3301100;
const LOCATION_TIMEOUT_MS = 8000;
const LAST_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_FIELD_LENGTH = 60;

export interface LocationReply {
  status: number;
  value: string;
}

export interface CoarseRegion {
  countryCode: string;
  countryName: string;
  province: string;
  city: string;
  district: string;
}

function cleanField(value?: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
}

/** 仅保留国家、省/直辖市、市、区/县级行政区，绝不向网页或模型暴露坐标与街道详情。 */
export function extractCoarseRegion(address: geoLocationManager.GeoAddress): CoarseRegion | null {
  const rawCode = cleanField(address.countryCode).toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(rawCode) ? rawCode : '';
  const countryName = cleanField(address.countryName);
  const province = cleanField(address.administrativeArea);
  const city = cleanField(address.locality) || cleanField(address.subAdministrativeArea);
  const district = cleanField(address.subLocality);
  if (!countryCode && !countryName && !province && !city && !district) {
    return null;
  }
  return {
    countryCode,
    countryName,
    province,
    city,
    district
  };
}

function hasLocationPermission(manager: abilityAccessCtrl.AtManager): boolean {
  try {
    const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    return manager.checkAccessTokenSync(info.appInfo.accessTokenId, APPROXIMATE_LOCATION) ===
      abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
  } catch (error) {
    hilog.warn(0x0000, 'PocketChat', 'Cannot check location permission: %{public}d', (error as BusinessError).code);
    return false;
  }
}

export async function requestApproximateLocation(context: common.UIAbilityContext,
  openSettings: boolean): Promise<boolean> {
  try {
    const manager = abilityAccessCtrl.createAtManager();
    if (hasLocationPermission(manager)) {
      return true;
    }
    const result = await manager.requestPermissionsFromUser(context, [APPROXIMATE_LOCATION]);
    if (result.authResults[0] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
      return true;
    }
    // 仅在用户主动在设置页开启自动定位时，才引导打开系统二次授权弹窗。
    if (openSettings && result.dialogShownResults?.[0] === false) {
      const statuses = await manager.requestPermissionOnSetting(context, [APPROXIMATE_LOCATION]);
      return statuses[0] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    }
  } catch (error) {
    hilog.warn(0x0000, 'PocketChat', 'Cannot request location permission: %{public}d', (error as BusinessError).code);
  }
  return false;
}

/** 仅在前台按需使用模糊定位，并在本机反地理编码为城市与行政区。 */
export class LocationService {
  private readonly context: common.UIAbilityContext;
  private foreground: boolean = true;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  static supported(): boolean {
    return canIUse('SystemCapability.Location.Location.Core') &&
      canIUse('SystemCapability.Location.Location.Geocoder');
  }

  setForeground(active: boolean): void {
    this.foreground = active;
  }

  async locate(locale: string, openSettings: boolean): Promise<LocationReply> {
    if (!canIUse('SystemCapability.Location.Location.Core') ||
      !canIUse('SystemCapability.Location.Location.Geocoder')) {
      return { status: DeviceStatus.UNSUPPORTED, value: '' };
    }
    if (!this.foreground) {
      return { status: DeviceStatus.CANCELLED, value: '' };
    }
    const granted = await requestApproximateLocation(this.context, openSettings);
    if (!granted) {
      return { status: DeviceStatus.DENIED, value: '' };
    }
    if (!this.foreground) {
      return { status: DeviceStatus.CANCELLED, value: '' };
    }
    try {
      if (!geoLocationManager.isLocationEnabled()) {
        return { status: LOCATION_SWITCH_OFF, value: '' };
      }
      if (!geoLocationManager.isGeocoderAvailable()) {
        return { status: DeviceStatus.UNSUPPORTED, value: '' };
      }
      const location = await this.readApproximateCoordinates();
      if (!this.foreground) {
        return { status: DeviceStatus.CANCELLED, value: '' };
      }
      if (!location) {
        return { status: DeviceStatus.FAILED, value: '' };
      }
      const reverseRequest: geoLocationManager.ReverseGeoCodeRequest = {
        latitude: location.latitude,
        longitude: location.longitude,
        maxItems: 1,
        locale: locale.startsWith('en') ? 'en' : 'zh'
      };
      const addresses = await geoLocationManager.getAddressesFromLocation(reverseRequest);
      if (!this.foreground) {
        return { status: DeviceStatus.CANCELLED, value: '' };
      }
      const region = addresses.length > 0 ? extractCoarseRegion(addresses[0]) : null;
      if (!region) {
        return { status: DeviceStatus.FAILED, value: '' };
      }
      return { status: DeviceStatus.OK, value: JSON.stringify(region) };
    } catch (error) {
      const code = (error as BusinessError).code;
      hilog.warn(0x0000, 'PocketChat', 'Cannot resolve approximate location: %{public}d', code);
      if (code === 201) {
        return { status: DeviceStatus.DENIED, value: '' };
      }
      if (code === 801) {
        return { status: DeviceStatus.UNSUPPORTED, value: '' };
      }
      return { status: code > 0 ? code : DeviceStatus.FAILED, value: '' };
    }
  }

  private async readApproximateCoordinates(): Promise<geoLocationManager.Location | null> {
    if (!canIUse('SystemCapability.Location.Location.Core')) {
      return null;
    }
    const request: geoLocationManager.SingleLocationRequest = {
      locatingPriority: geoLocationManager.LocatingPriority.PRIORITY_LOCATING_SPEED,
      locatingTimeoutMs: LOCATION_TIMEOUT_MS
    };
    try {
      return await geoLocationManager.getCurrentLocation(request);
    } catch (error) {
      const code = (error as BusinessError).code;
      if (code === 201 || code === 801 || code === LOCATION_SWITCH_OFF) {
        throw error as Error;
      }
      hilog.warn(0x0000, 'PocketChat', 'Current location failed (%{public}d), trying recent fix', code);
      try {
        const last = geoLocationManager.getLastLocation();
        if (Math.abs(Date.now() - last.timeStamp) <= LAST_LOCATION_MAX_AGE_MS) {
          return last;
        }
      } catch {
        // 无可用缓存定位，走上层回退流程。
      }
      return null;
    }
  }
}
