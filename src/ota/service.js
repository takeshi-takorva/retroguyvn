import { createDeviceOtaService } from './device-service.js';
import { createReleaseOtaService } from './release-service.js';
import { createOtaV1Service } from './v1-service.js';

export const createOtaService = options => Object.assign(
  {},
  createDeviceOtaService(options),
  createReleaseOtaService(options),
  createOtaV1Service(options)
);
