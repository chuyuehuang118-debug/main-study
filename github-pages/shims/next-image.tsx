import { createElement, type ImgHTMLAttributes } from 'react';

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export default function Image({
  priority: _priority,
  alt = '',
  ...props
}: ImageProps) {
  return createElement('img', { ...props, alt });
}
