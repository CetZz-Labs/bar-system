import React from 'react';

// Mock motion components for testing
// This replaces motion/react components with simple DOM elements
// that still accept className, children, and other props.

const createMockMotionComponent = (tag: string) => {
  const Component = React.forwardRef<HTMLElement, any>(
    ({ children, ...props }, ref) => {
      // Filter out motion-specific props (whileTap, whileHover, etc.)
      const filteredProps = { ...props };
      delete filteredProps['whileTap'];
      delete filteredProps['whileHover'];
      delete filteredProps['whileFocus'];
      delete filteredProps['whileDrag'];
      delete filteredProps['whileInView'];
      delete filteredProps['animate'];
      delete filteredProps['initial'];
      delete filteredProps['exit'];
      delete filteredProps['transition'];
      delete filteredProps['variants'];
      delete filteredProps['layout'];
      delete filteredProps['layoutId'];
      delete filteredProps['drag'];
      delete filteredProps['dragConstraints'];
      delete filteredProps['dragElastic'];
      delete filteredProps['dragMomentum'];
      delete filteredProps['dragSnapToOrigin'];
      delete filteredProps['dragTransition'];
      delete filteredProps['onDrag'];
      delete filteredProps['onDragStart'];
      delete filteredProps['onDragEnd'];
      delete filteredProps['onAnimationStart'];
      delete filteredProps['onAnimationComplete'];
      delete filteredProps['onUpdate'];
      delete filteredProps['onBeforeLayoutMeasure'];
      delete filteredProps['onLayoutMeasure'];
      delete filteredProps['onLayoutAnimationStart'];
      delete filteredProps['onLayoutAnimationComplete'];

      return React.createElement(tag, { ...filteredProps, ref }, children);
    }
  );
  Component.displayName = `MotionComponent(${tag})`;
  return Component;
};

export const mockMotion = () => {
  const motion = new Proxy({} as Record<string, React.ComponentType<any>>, {
    get: (target, prop) => {
      if (typeof prop === 'string') {
        if (!target[prop]) {
          target[prop] = createMockMotionComponent(prop);
        }
        return target[prop];
      }
      return undefined;
    },
  });

  return {
    motion,
    // Also export AnimatePresence as a passthrough component
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
    // Export other motion utilities as needed
    useAnimation: () => ({
      start: () => Promise.resolve(),
      stop: () => {},
      set: () => {},
    }),
    useMotionValue: (initial: number) => ({
      get: () => initial,
      set: () => {},
      on: () => () => {},
    }),
    useTransform: (value: unknown) => value,
    useSpring: (value: unknown) => value,
    useScroll: () => ({
      scrollX: { get: () => 0, set: () => {} },
      scrollY: { get: () => 0, set: () => {} },
      scrollXProgress: { get: () => 0, set: () => {} },
      scrollYProgress: { get: () => 0, set: () => {} },
    }),
  };
};