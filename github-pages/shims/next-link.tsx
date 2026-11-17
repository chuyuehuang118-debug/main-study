import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';

type LinkProps = PropsWithChildren<
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>;

export default function Link({ href, children, ...props }: LinkProps) {
  const githubHref =
    href === '/researcher'
      ? '/main-study/#/researcher'
      : href === '/'
        ? '/main-study/'
        : href;
  return (
    <a href={githubHref} {...props}>
      {children}
    </a>
  );
}
