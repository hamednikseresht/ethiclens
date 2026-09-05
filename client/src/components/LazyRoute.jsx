import { Component, Suspense } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Wrapper for routes whose code is fetched on demand.
 *
 * Splitting a route out introduces a failure mode a static import cannot
 * have: the chunk is fetched later, over the network, and it can fail. The
 * common way is a deploy — someone has the app open, the build is replaced,
 * their index.html still names chunks that no longer exist, and the next
 * navigation rejects. Without a boundary that surfaces as a blank screen and
 * a promise rejection nobody sees.
 *
 * Reloading genuinely fixes it, because the shell is served no-cache and so
 * comes back naming the current chunks. That is why the recovery here is a
 * reload rather than a retry of the same import, which would just fetch the
 * same missing URL again.
 */
class ChunkBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[lazy] chunk failed to load:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="mx-auto max-w-xl md:max-w-4xl px-5 py-10 text-center">
        <p className="mb-1 text-sm font-bold">این بخش بارگذاری نشد</p>
        <p className="mb-4 text-justify text-[12.5px] leading-loose text-text-4">
          معمولاً وقتی پیش می‌آید که نسخه تازه‌ای از برنامه منتشر شده و صفحه‌ی باز شما
          هنوز نسخه قبلی است. تازه‌کردن صفحه حلش می‌کند.
        </p>
        <Button variant="primary" size="sm" onClick={() => location.reload()}>
          تازه کردن صفحه
        </Button>
      </div>
    );
  }
}

/** A spinner sized so the layout does not jump when the chunk arrives. */
export function RouteFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <span className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function LazyRoute({ children }) {
  return (
    <ChunkBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ChunkBoundary>
  );
}
