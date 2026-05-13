declare module './SplashCursor' {
  import type { ComponentType } from 'react';

  type SplashCursorProps = {
    SIM_RESOLUTION?: number;
    DYE_RESOLUTION?: number;
    CAPTURE_RESOLUTION?: number;
    DENSITY_DISSIPATION?: number;
    VELOCITY_DISSIPATION?: number;
    PRESSURE?: number;
    PRESSURE_ITERATIONS?: number;
    CURL?: number;
    SPLAT_RADIUS?: number;
    SPLAT_FORCE?: number;
    SHADING?: boolean;
    COLOR_UPDATE_SPEED?: number;
    BACK_COLOR?: { r: number; g: number; b: number };
    TRANSPARENT?: boolean;
    RAINBOW_MODE?: boolean;
    COLOR?: string;
  };

  const SplashCursor: ComponentType<SplashCursorProps>;
  export default SplashCursor;
}
