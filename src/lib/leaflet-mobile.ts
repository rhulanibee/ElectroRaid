import type { Map as LeafletMap } from "leaflet";

/**
 * On phones/tablets, one-finger drag scrolls the page; two fingers pan the map.
 * Desktop keeps normal click-drag behaviour.
 */
export function bindPageScrollFriendlyMap(
  map: LeafletMap,
  el: HTMLElement,
): () => void {
  const mq = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 1023px)");

  const sync = () => {
    if (mq.matches) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      el.style.touchAction = "pan-y";
      el.classList.add("leaflet-page-scroll");
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      el.style.touchAction = "";
      el.classList.remove("leaflet-page-scroll");
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!mq.matches) return;
    if (event.touches.length >= 2) {
      map.dragging.enable();
    } else {
      map.dragging.disable();
    }
  };

  const onTouchEnd = () => {
    if (!mq.matches) return;
    map.dragging.disable();
  };

  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("touchcancel", onTouchEnd, { passive: true });
  mq.addEventListener("change", sync);
  sync();

  return () => {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
    mq.removeEventListener("change", sync);
    el.style.touchAction = "";
    el.classList.remove("leaflet-page-scroll");
  };
}
