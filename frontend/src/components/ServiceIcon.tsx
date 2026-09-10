/**
 * Maps a service.icon string from the DB (e.g. "BarChart3") to the
 * matching lucide-react component. Used everywhere the Service catalog
 * is rendered so we can stop showing emoji icons in the DB.
 *
 * If the icon string is unknown, falls back to the generic Layers icon.
 * Passing an emoji character (legacy rows) also falls back cleanly.
 */

import {
  BarChart3,
  Coins,
  Layers,
  LineChart,
  Trophy,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const REGISTRY: Record<string, LucideIcon> = {
  BarChart3,
  Coins,
  Layers,
  LineChart,
  Trophy,
  Video,
  Wrench,
};

export default function ServiceIcon({
  icon,
  size = 14,
  className,
}: {
  icon?: string | null;
  size?: number;
  className?: string;
}) {
  const Comp = (icon && REGISTRY[icon]) || Layers;
  return <Comp size={size} className={className} />;
}
