import { describe, it, expect } from 'vitest';
import { SPELL_PATTERNS } from '@model/spell/SpellPatternRegistry';

describe('SpellPatternRegistry', () => {
    describe('island pattern', () => {
        it('has the standard and doubled variants', () => {
            const ids = SPELL_PATTERNS.island.variants.map(v => v.variantID);
            expect(ids).toContain('standard');
            expect(ids).toContain('doubled');
        });

        it('standard variant has two isolated components', () => {
            const variant = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            expect(variant.components).toHaveLength(2);
        });

        it('standard spine component is a single bridge', () => {
            const variant = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            expect(variant.components[0].segments).toHaveLength(1);
        });

        it('standard spine is a 4-tile vertical bridge', () => {
            const variant = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            const seg = variant.components[0].segments[0];
            expect(seg.x1).toBe(seg.x2);                     // vertical
            expect(Math.abs(seg.y2 - seg.y1)).toBe(4);        // 4 tiles
        });

        it('standard U-shape component has 3 bridges', () => {
            const variant = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            expect(variant.components[1].segments).toHaveLength(3);
        });

        it('standard U-shape bridges are all 4 tiles long', () => {
            const variant = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            for (const seg of variant.components[1].segments) {
                const len = Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
                expect(len).toBe(4);
            }
        });

        it('doubled variant component coordinates are 2× standard', () => {
            const standard = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'standard')!;
            const doubled = SPELL_PATTERNS.island.variants.find(v => v.variantID === 'doubled')!;

            const stdSeg = standard.components[0].segments[0];
            const dblSeg = doubled.components[0].segments[0];

            expect(dblSeg.x1).toBe(stdSeg.x1 * 2);
            expect(dblSeg.y1).toBe(stdSeg.y1 * 2);
            expect(dblSeg.x2).toBe(stdSeg.x2 * 2);
            expect(dblSeg.y2).toBe(stdSeg.y2 * 2);
        });
    });

    describe('bridge pattern', () => {
        it('has 5 variants for widths 4–8', () => {
            expect(SPELL_PATTERNS.bridge.variants).toHaveLength(5);
        });

        it('variant IDs match expected width names', () => {
            const ids = SPELL_PATTERNS.bridge.variants.map(v => v.variantID);
            expect(ids).toEqual(['width4', 'width5', 'width6', 'width7', 'width8']);
        });

        it('each bridge variant has exactly one component', () => {
            for (const variant of SPELL_PATTERNS.bridge.variants) {
                expect(variant.components).toHaveLength(1);
            }
        });

        it('each bridge component has exactly 6 bridges', () => {
            for (const variant of SPELL_PATTERNS.bridge.variants) {
                expect(variant.components[0].segments).toHaveLength(6);
            }
        });

        it('width4 variant uses 2-tile side bridges and 4-tile horizontals', () => {
            const variant = SPELL_PATTERNS.bridge.variants.find(v => v.variantID === 'width4')!;
            const segs = variant.components[0].segments;
            // two left vertical bridges (2 tiles each)
            expect(Math.abs(segs[0].y2 - segs[0].y1)).toBe(2);
            expect(Math.abs(segs[1].y2 - segs[1].y1)).toBe(2);
            // top horizontal bridge (4 tiles)
            expect(Math.abs(segs[2].x2 - segs[2].x1)).toBe(4);
            // bottom horizontal bridge (4 tiles)
            expect(Math.abs(segs[3].x2 - segs[3].x1)).toBe(4);
        });

        it('wider variants have longer horizontal bridges', () => {
            const widths = [4, 5, 6, 7, 8];
            for (let i = 0; i < widths.length; i++) {
                const variant = SPELL_PATTERNS.bridge.variants[i];
                const topHorizontal = variant.components[0].segments[2];
                expect(Math.abs(topHorizontal.x2 - topHorizontal.x1)).toBe(widths[i]);
            }
        });
    });

    describe('open pattern', () => {
        it('has 3 variants', () => {
            expect(SPELL_PATTERNS.open.variants).toHaveLength(3);
        });

        it('each open variant has two components', () => {
            for (const variant of SPELL_PATTERNS.open.variants) {
                expect(variant.components).toHaveLength(2);
            }
        });

        it('each component has exactly 5 bridges', () => {
            for (const variant of SPELL_PATTERNS.open.variants) {
                expect(variant.components[0].segments).toHaveLength(5);
                expect(variant.components[1].segments).toHaveLength(5);
            }
        });

        it('all open spell bridges are 2 tiles long', () => {
            for (const variant of SPELL_PATTERNS.open.variants) {
                for (const component of variant.components) {
                    for (const seg of component.segments) {
                        const len = Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
                        expect(len).toBe(2);
                    }
                }
            }
        });

        it('later variants have a wider gap between left and right components', () => {
            // The rightBaseX of the right component increases across variants.
            const rightMinXByVariant = SPELL_PATTERNS.open.variants.map(v => {
                const rightComp = v.components[1];
                return Math.min(...rightComp.segments.flatMap(s => [s.x1, s.x2]));
            });
            for (let i = 1; i < rightMinXByVariant.length; i++) {
                expect(rightMinXByVariant[i]).toBeGreaterThan(rightMinXByVariant[i - 1]);
            }
        });
    });

    describe('all patterns', () => {
        it('all segment endpoints are integers', () => {
            for (const def of Object.values(SPELL_PATTERNS)) {
                for (const variant of def.variants) {
                    for (const component of variant.components) {
                        for (const seg of component.segments) {
                            expect(Number.isInteger(seg.x1)).toBe(true);
                            expect(Number.isInteger(seg.y1)).toBe(true);
                            expect(Number.isInteger(seg.x2)).toBe(true);
                            expect(Number.isInteger(seg.y2)).toBe(true);
                        }
                    }
                }
            }
        });

        it('all segments are axis-aligned (horizontal or vertical only)', () => {
            for (const def of Object.values(SPELL_PATTERNS)) {
                for (const variant of def.variants) {
                    for (const component of variant.components) {
                        for (const seg of component.segments) {
                            const isHorizontal = seg.y1 === seg.y2;
                            const isVertical = seg.x1 === seg.x2;
                            expect(
                                isHorizontal || isVertical,
                                `Diagonal segment in ${def.kind}/${variant.variantID}: (${seg.x1},${seg.y1})→(${seg.x2},${seg.y2})`
                            ).toBe(true);
                        }
                    }
                }
            }
        });

        it('no segment has zero length', () => {
            for (const def of Object.values(SPELL_PATTERNS)) {
                for (const variant of def.variants) {
                    for (const component of variant.components) {
                        for (const seg of component.segments) {
                            const len = Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
                            expect(len, `Zero-length segment in ${def.kind}/${variant.variantID}`).toBeGreaterThan(0);
                        }
                    }
                }
            }
        });
    });
});
