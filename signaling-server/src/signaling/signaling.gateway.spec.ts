import { Test, TestingModule } from '@nestjs/testing';
import { Signaling } from './signaling.gateway';

describe('SignalingGateway', () => {
  let gateway: Signaling;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Signaling],
    }).compile();

    gateway = module.get<Signaling>(Signaling);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
