/** 设备能力回给网页的通用状态码。系统错误码原样透传，均为正数且远大于这些值。 */
export class DeviceStatus {
  static readonly OK: number = 0;
  static readonly CANCELLED: number = 1;
  static readonly DENIED: number = 2;
  static readonly UNSUPPORTED: number = 3;
  static readonly TOO_LARGE: number = 4;
  static readonly FAILED: number = -1;
}
