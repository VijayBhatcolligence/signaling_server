import { Module } from '@nestjs/common';
import { Signaling } from './signaling/signaling.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [Signaling],
})
export class AppModule {}