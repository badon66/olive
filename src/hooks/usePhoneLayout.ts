import { useMediaQuery } from "./useMediaQuery";

// The phone app (BUILD_PLAN "Phone app") applies on a viewport narrower than
// 700px, OR on a phone turned sideways — a coarse pointer (touch) with a
// viewport shorter than 500px. Neither clause catches the portrait monitor
// (1080 wide, mouse) or the ultrawide, so those layouts are untouched.
export const PHONE_QUERY = "(max-width: 699px), ((pointer: coarse) and (max-height: 499px))";

export function usePhoneLayout(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
