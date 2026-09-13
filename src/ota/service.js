import { createDeviceOtaService } from './device-service.js';
import { createReleaseOtaService } from './release-service.js';

export const createOtaService = options => Object.assign(
  {},
  createDeviceOtaService(options),
  createReleaseOtaService(options)
);
