import { describe, it, expect } from 'vitest';
import {
  BridgeSpriteFrames,
  BridgeVisualConstants,
  getBridgeSegmentFrame,
  type BridgeOrientation,
  type BridgeSegmentPosition
} from '@view/BridgeSpriteFrameRegistry';

describe('BridgeSpriteFrameRegistry', () => {
  describe('BridgeSpriteFrames', () => {
    it('should have correct frame indices', () => {
      expect(BridgeSpriteFrames.FRAME_ISLAND).toBe(36);
      expect(BridgeSpriteFrames.H_BRIDGE_LEFT).toBe(55);
      expect(BridgeSpriteFrames.H_BRIDGE_CENTRE).toBe(56);
      expect(BridgeSpriteFrames.H_BRIDGE_RIGHT).toBe(57);
      expect(BridgeSpriteFrames.V_BRIDGE_BOTTOM).toBe(58);
      expect(BridgeSpriteFrames.V_BRIDGE_MIDDLE).toBe(59);
      expect(BridgeSpriteFrames.V_BRIDGE_TOP).toBe(60);
      expect(BridgeSpriteFrames.UNFINISHED_BRIDGE).toBe(61);
      expect(BridgeSpriteFrames.H_BRIDGE_SINGLE).toBe(62);
      expect(BridgeSpriteFrames.V_BRIDGE_SINGLE).toBe(63);
      expect(BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET).toBe(11);
    });
  });

  describe('BridgeVisualConstants', () => {
    it('should have correct visual constants', () => {
      expect(BridgeVisualConstants.PREVIEW_ALPHA).toBe(0.8);
      expect(BridgeVisualConstants.INVALID_TINT).toBe(0xff0000);
    });
  });

  describe('getBridgeSegmentFrame', () => {
    describe('single-segment bridges', () => {
      it('should return correct frame for single horizontal bridge', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'single', false);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_SINGLE);
      });

      it('should return correct frame for single vertical bridge', () => {
        const frame = getBridgeSegmentFrame('vertical', 'single', false);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_SINGLE);
      });

      it('should apply double bridge offset for single horizontal bridge', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'single', true);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_SINGLE + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET);
      });

      it('should apply double bridge offset for single vertical bridge', () => {
        const frame = getBridgeSegmentFrame('vertical', 'single', true);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_SINGLE + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET);
      });
    });

    describe('horizontal multi-segment bridges', () => {
      it('should return left frame for start position', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'start', false);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_LEFT);
      });

      it('should return centre frame for middle position', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'middle', false);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_CENTRE);
      });

      it('should return right frame for end position', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'end', false);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_RIGHT);
      });

      it('should apply double bridge offset to start position', () => {
        const frame = getBridgeSegmentFrame('horizontal', 'start', true);
        expect(frame).toBe(BridgeSpriteFrames.H_BRIDGE_LEFT + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET);
      });
    });

    describe('vertical multi-segment bridges', () => {
      it('should return top frame for start position', () => {
        const frame = getBridgeSegmentFrame('vertical', 'start', false);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_TOP);
      });

      it('should return middle frame for middle position', () => {
        const frame = getBridgeSegmentFrame('vertical', 'middle', false);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_MIDDLE);
      });

      it('should return bottom frame for end position', () => {
        const frame = getBridgeSegmentFrame('vertical', 'end', false);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_BOTTOM);
      });

      it('should apply double bridge offset to end position', () => {
        const frame = getBridgeSegmentFrame('vertical', 'end', true);
        expect(frame).toBe(BridgeSpriteFrames.V_BRIDGE_BOTTOM + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET);
      });
    });
  });
});
