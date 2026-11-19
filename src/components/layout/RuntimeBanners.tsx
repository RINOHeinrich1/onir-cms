import { DebugBanner } from "./DebugBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";

/** Bandeaux opérationnels empilés sous le header, avec un seul point sticky. */
export function RuntimeBanners() {
  return (
    <div className="runtime-banners">
      <MaintenanceBanner />
      <DebugBanner />
    </div>
  );
}
