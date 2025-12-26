"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

interface TextShimmerProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
}

export function TextShimmer({ children, className, duration = 2 }: TextShimmerProps) {
  return (
    <motion.span
      className={cn(
        "inline-block bg-clip-text text-transparent",
        "bg-gradient-to-r from-gray-400 via-gray-600 to-gray-400",
        "dark:from-gray-500 dark:via-gray-300 dark:to-gray-500",
        "bg-[length:200%_100%]",
        className
      )}
      animate={{
        backgroundPosition: ["100% 0%", "-100% 0%"],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      {children}
    </motion.span>
  );
}










