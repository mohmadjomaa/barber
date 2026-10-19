import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject } from '@angular/core';
import { LanguageService } from '../services/language';

@Directive({ selector: '[appLocalized]', standalone: true })
export class LocalizedContentDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly language = inject(LanguageService);
  private readonly originals = new WeakMap<Text, string>();
  private readonly attributeOriginals = new WeakMap<Element, Map<string, string>>();
  private observer?: MutationObserver;

  constructor() { effect(() => { this.language.language(); queueMicrotask(() => this.translateTree()); }); }

  ngAfterViewInit() {
    this.observer = new MutationObserver(() => this.translateTree());
    this.observer.observe(this.host.nativeElement, { childList: true, subtree: true, characterData: true });
    this.translateTree();
  }

  ngOnDestroy() { this.observer?.disconnect(); }

  private translateTree() {
    const root = this.host.nativeElement as HTMLElement;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const original = this.originals.get(node) ?? node.nodeValue ?? '';
      if (!original.trim()) continue;
      this.originals.set(node, original);
      const translated = this.translatePreservingWhitespace(original);
      if (node.nodeValue !== translated) node.nodeValue = translated;
    }
    Array.from(root.querySelectorAll('*')).forEach((element: Element) => {
      ['aria-label', 'placeholder', 'title'].forEach((attribute) => {
        const current = element.getAttribute(attribute);
        if (!current) return;
        const originals = this.attributeOriginals.get(element) ?? new Map<string, string>();
        const original = originals.get(attribute) ?? current;
        originals.set(attribute, original);
        this.attributeOriginals.set(element, originals);
        const translated = this.language.text(original);
        if (current !== translated) element.setAttribute(attribute, translated);
      });
    });
  }

  private translatePreservingWhitespace(value: string) {
    const prefix = value.match(/^\s*/)?.[0] || '';
    const suffix = value.match(/\s*$/)?.[0] || '';
    return `${prefix}${this.language.text(value.trim())}${suffix}`;
  }
}
