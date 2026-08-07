import { randomUUID } from 'node:crypto';
import type { Logger } from '@fathersnet/logger';
import type { Channel, Priority } from '../types';

export interface DispatchRequest {
  instanceId: string;
  userId: string;
  runId: string;
  templateCode: string;
  channel: Channel;
  priority: Priority;
  /** Rendered localized title/body (EN + AM, FR-047). */
  title: string;
  body: string;
}

export interface DispatchResult {
  ok: boolean;
  /** Provider reference for the ack callback (real providers: Phase 4 / M-02). */
  providerRef: string;
  /** True for the Phase-2 stub — delivery is simulated, never claimed. */
  simulated: boolean;
}

/**
 * Outbound channel adapter contract. The Phase-2 dispatcher is a **stub**: it
 * records a simulated success and returns a synthetic provider reference. Real
 * providers (WhatsApp Meta, Phase 4 / M-02) implement the same interface and
 * report delivery through the reserved ack callback on the internal contract.
 * No delivery is ever claimed by the stub (R8).
 */
export interface ChannelDispatcher {
  dispatch(request: DispatchRequest): Promise<DispatchResult>;
}

/** Stub dispatcher — logs the intended send and simulates success (R8). */
export function createStubDispatcher(logger?: Logger): ChannelDispatcher {
  return {
    async dispatch(request: DispatchRequest): Promise<DispatchResult> {
      logger?.debug('dispatcher.stub_dispatch', 'stub dispatch recorded', {
        instance_id: request.instanceId,
        user_id: request.userId,
        run_id: request.runId,
        template_code: request.templateCode,
        channel: request.channel,
        priority: request.priority,
      });
      return { ok: true, providerRef: `stub:${randomUUID()}`, simulated: true };
    },
  };
}
