/**
 * 퍼즐 등록부. add-puzzle 절차(puzzle-builder)가 여기 등록한다.
 * 여기 없는 퍼즐은 로드되지 않는다 — 맵의 `puzzleId`가 만족되지 않으면
 * 그 오브젝트는 `interactAnchor` 대사만 띄운다.
 */
import type { PuzzleModule } from "./engine/puzzle-host/types";
import { pendulumDynamo } from "./puzzles/pendulum-dynamo/puzzle";
import { wallSounding } from "./puzzles/wall-sounding/puzzle";
import { silentNode } from "./puzzles/silent-node/puzzle";
import { monochord } from "./puzzles/monochord/puzzle";
import { sonicConsole } from "./puzzles/sonic-console/puzzle";

// 배열 순서 = 저널의 원리 카드 나열 순서. 관례상 코드 조각 순서와 맞추고 콘솔을 마지막에 둔다.
// (여기선 멜로디 음 순서 — 도·미·라·솔)
export const puzzles: PuzzleModule[] = [
  pendulumDynamo,
  wallSounding,
  silentNode,
  monochord,
  sonicConsole,
];

export function findPuzzle(id: string): PuzzleModule | undefined {
  return puzzles.find((p) => p.manifest.id === id);
}
