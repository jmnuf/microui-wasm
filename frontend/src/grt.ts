
export async function exec<T>(fn: () => Generator<any, T>): Promise<T> {
  const it = fn();
  let step = it.next();
  while (!step.done) {
    if (step.value instanceof Promise) {
      step.value = await step.value;
    }
    step = it.next(step.value);
  }
  if (step.value instanceof Promise) {
    step.value = await step.value;
  }
  return step.value;
}

export function* yp<T>(promise: Promise<T>): Generator<any, T> {
  return yield promise;
}

export const wait_event_frame = () => yp(new Promise(resolve => setTimeout(resolve, 0)));
export const wait_anim_frame = () => yp(new Promise(resolve => requestAnimationFrame(resolve)));

type GrtChildNodeDiff =
  | { kind: 'same'; }
  | { kind: 'remove'; }
  | { kind: 'replace'; item: GrtNode; }
  | { kind: 'add'; child: GrtNode; }
  ;

type GrtNodeDiff =
  | GrtChildNodeDiff
  | { kind: 'patch'; children: Array<GrtNodeDiff> }
;

class GRTNode<TKind extends string = string> {
  readonly kind: TKind;
  readonly children: Array<GRTNode>;
  readonly props: Record<string, unknown>;

  constructor(kind: TKind, properties: Record<string, unknown>) {
    this.kind = kind;

    let children = properties.children;
    if (children != null) {
      if (!Array.isArray(children)) {
        if (!(children instanceof GRTNode)) {
          throw new Error('GrtNode children can only be other GrtNode instances');
        }
        children = [children];
      } else {
        children = children.flat(Infinity).filter(Boolean);
      }
    } else {
      children = [];
    }
    this.children = children as Array<GRTNode>;
    this.props = {};

    for (const key of Object.keys(properties)) {
      if (key === 'children' || key === 'kind') continue;
      this.props[key] = properties[key];
    }
  }

  append(...nodes: Array<string | GRTNode>) {
    for (const n of nodes) {
      if (n instanceof GRTNode) {
        this.children.push(n);
      } else if (typeof n === 'string') {
        this.children.push(new GRTTextNode(n));
      }
    }
  }

  get child_count() { return this.children.length; }

  // Don't ask me why I did all the shit I did in this function, my brain's LLM just spit this jargon while I was thinking about anime thighs and since this is not a serious project I didn't bother cleaning anything up or come up with a reason for its existence
  is_eq(other: GRTNode): boolean {
    if (other == null) return false;
    if (other.kind !== this.kind) return false;
    for (const key of Object.keys(this)) {
      if (key === 'children') continue;
      if (key === 'props') {
        const propsA = this.props;
        const propsB = other.props;
        const propsA_keys = Object.keys(propsA);
        const propsB_keys = Object.keys(propsB);
        if (propsA_keys.length !== propsB_keys.length) return false;
        for (const keyA of propsA_keys) {
          if (!propsB_keys.includes(keyA)) return false;
        }
        for (const keyB of propsB_keys) {
          if (!propsA_keys.includes(keyB)) return false;
        }
        for (const key of propsA_keys) {
          const valA = propsA[key];
          const valB = propsB[key];
          if (typeof valA !== typeof valB) return false;
          // if (typeof valA === 'function' || typeof valA === 'object') continue;
          // Assuming C structs, if they point to the same memory address they are equal
          /*
          if (typeof valA === 'object' && valA && typeof valA.ptr === 'number') {
            if (valA.ptr === valB.ptr) continue;
            else return false;
          }
          */
          if (valA !== valB) return false;
        }
      }
      // @ts-ignore
      if (typeof this[key] === 'function' || typeof this[key] === 'object') continue;
      // @ts-ignore
      const val = this[key];
      // @ts-ignore
      const otv = other[key];
      if (val != otv) return false;
    }
    return true;
  }

  diff(other: GRTNode): GrtNodeDiff {
    if (other.kind !== this.kind) return { kind: 'replace', item: other };
    const children = [] as Array<GrtNodeDiff>;
    let patch_required = false;
    for (let i = 0; i < Math.max(this.child_count, other.child_count); ++i) {
      const childA = this.children[i];
      const childB = other.children[i];
      if (childA != null && childB == null) {
        children.push({ kind: 'remove' });
        patch_required = true;
        continue;
      }
      if (childA == null && childB != null) {
        children.push({ kind: 'add', child: childB });
        patch_required = true;
        continue;
      }
      if (childA != null && childB != null) {
        const subdiff = childA.diff(childB);
        children.push(subdiff);
        if (subdiff.kind === 'same') { continue; }
        patch_required = true;
        continue;
      }
      if (childA == null && childB == null) {
        children.push({ kind: 'same' });
        continue;
      }
      children.push({ kind: 'same' });
    }

    if (!patch_required) {
      return { kind: 'same' };
    }

    return { kind: 'patch', children };
  }

  collapse() {
    if (this.child_count === 0) return;
    if (this.child_count === 1) {
      this.children[0].collapse();
      return;
    }

    // @ts-ignore I know what I'm doing, I thunk
    const x = typeof this.x === 'number' ? this.x : undefined;
    // @ts-ignore I know what I'm doing, I thunk
    const y = typeof this.y === 'number' ? this.y : undefined;

    const new_children = [this.children[0]];
    for (let i = 1; i < this.children.length; ++i) {
      let childA = new_children[new_children.length - 1];
      if (childA.kind === 'unclip') {
        const childB = this.children[i];
        new_children.push(childB);
        continue;
      }
      if (childA.kind === 'clip') {
        if (this.children[i].kind == 'unclip') {
          new_children.push(this.children[i]);
          continue;
        }
        let offset = 0;
        while (childA && childA.kind != 'unclip') {
          childA = this.children[i+(offset++)];
        }
        if (!childA) {
          console.error('Unexpected clip child stored without an unclip', this.children, new_children);
          continue;
          // throw new Error('Unexpected clip child stored without an unclip');
        } else {
          i += offset;
          continue;
        }
      }

      const childB = this.children[i];

      if (childA.kind === 'container' && childB.kind === 'clip') {
        childA.append(childB);
        const stack = [childB];
        // console.log('Clip space opened:', i, childA, childB);
        while (stack.length > 0) {
          ++i;
          if (i >= this.children.length) {
            console.log(stack);
            console.table(this.children.map(node => node.kind));
            throw new Error('Failed to find closing unclip command for elements in stack: ' + stack.length);
          }
          const childC = this.children[i];
          if (childC.kind == 'unclip') {
            stack.pop();
            const parent = stack.length > 0 ? stack[stack.length-1] : childA;
            parent.append(childC);
            // console.log('Clip space closed:', stack.length, node)
            // if (stack.length > 0) console.log('Clip space parent:', stack[stack.length-1]);
            // else console.log('Clip space parent:', childA);
            // console.log(i, stack, childC);
            if (stack.length === 0) {
              ++i;
              break;
            }
          }
          if (childC.kind == 'clip') {
            stack.push(childC);
            // console.log('Clip space opened:', stack.length, childC);
          }
          const clip_node = stack[stack.length-1];
          clip_node.append(childC);
        }
        continue;
      }
      if ((childA.kind === 'container' || childA.kind === 'clip') && childB.kind === ':text') {
        childA.append(childB);
        continue;
      }
      if (childA.kind === 'container' && childB.kind === 'container') {
        // @ts-ignore trust, trust it'll be fine
        if (childB.width <= 1 || childB.height <= 1) {
          childA.append(childB);
          // @ts-ignore trust, trust it'll be fine
          if (x !== undefined && x + childA.x != 0) {
            // @ts-ignore trust, trust it'll be fine
            childB.x -= (x + childA.x);
          }
          // @ts-ignore trust, trust it'll be fine
          if (y !== undefined && y + childA.y != 0) {
            // @ts-ignore trust, trust it'll be fine
            childB.y -= (y + childA.y);
          }
          continue;
        }
      }

      new_children.push(childB);
    }
    for (const n of new_children) {
      // console.log(n);
      n.collapse();
    }
    // @ts-ignore
    this.children = new_children;
  }
}
export type GrtNode<T extends string = string> = InstanceType<typeof GRTNode<T>>;

class GRTTextNode extends GRTNode<':text'> {
  readonly children: [];
  data: string;

  constructor(data: string, props: Record<string, unknown> = {}) {
    super(':text', props);
    if ('data' in this.props) delete this.props.data;
    this.children = [];
    this.data = data;
  }
}
export type GrtTextNode = InstanceType<typeof GRTTextNode>;

class GRTRootNode extends GRTNode<':root'> {
  bounds: { x: number; y: number; width: number; height: number; };
  constructor(props: Record<string, unknown>) {
    super(':root', props);
    this.bounds = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }


}
export type GrtRootNode = InstanceType<typeof GRTRootNode>;

class GRTClipNode extends GRTNode<'clip'> {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(props: { x: number; y: number; width: number; height: number; } & Record<(string & {}), unknown>) {
    super('clip', props);

    this.x = props.x;
    this.y = props.y;
    this.width = props.width;
    this.height = props.height;
  }
}

class GRTContainerNode extends GRTNode<'container'> {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(props: { x: number; y: number; width: number; height: number; } & Record<(string & {}), unknown>) {
    super('container', props);
    
    this.x = props.x;
    this.y = props.y;
    this.width = props.width;
    this.height = props.height;
  }
}
export type GrtContainerNode = InstanceType<typeof GRTContainerNode>;


type GrtNodeProps<TKind extends string> = TKind extends ':text'
  ? { data?: string; color: unknown; } & Record<(string & {}), unknown>
  : TKind extends 'clip'
  ? { x: number; y: number; width: number; height: number; } & Record<(string & {}), unknown>
  : TKind extends 'container'
  ? { x: number; y: number; width: number; height: number; color: unknown; } & Record<(string & {}), unknown>
  : Record<(string & {}), unknown>
;

export function createNode(kind: ':root'): GrtRootNode;
export function createNode(kind: ':null'): GrtRootNode;
export function createNode<TKind extends string>(kind: TKind, props: GrtNodeProps<TKind>): GrtTextNode;
export function createNode(kind: string, properties: Record<string, unknown> = {}) {
  if (kind === ':text') {
    const data = properties.data ? String(properties.data) : '';
    return new GRTTextNode(data, properties);
  }
  if (kind === ':root') {
    // @ts-ignore
    return new GRTRootNode(properties);
  }
  if (kind === 'clip') {
    // @ts-ignore
    return new GRTClipNode(properties);
  }
  if (kind === 'container') {
    // @ts-ignore
    return new GRTContainerNode(properties);
  }
  return new GRTNode(kind, properties);
}

export function render(grt_node: GrtNode) {
  let dom_node: HTMLElement | Comment | null = null;
  switch (grt_node.kind) {
    case ':null': return null;

    case ':root': {
      dom_node = document.createElement('div');
      dom_node.append(...grt_node.children.map(node => render(node)).filter(x => x != null));
    } break;

    case ':text': {
      const text = grt_node as GrtTextNode;
      dom_node = document.createElement('p');
      dom_node.append(text.data);
      if (typeof grt_node.props.color === 'object') {
        const clr = grt_node.props.color as { r: number; g: number; b: number; a: number; };
        dom_node.style.color = `rgba(${clr.r}, ${clr.g}, ${clr.b}, ${clr.a / 255})`;
      }
    } break;

    case 'container': {
      const container = grt_node as GrtContainerNode;
      const tag = typeof grt_node.props.tag === 'string' ? grt_node.props.tag : 'div';
      dom_node = document.createElement(tag);

      dom_node.style.position = 'relative';
      if (container.x !== 0) dom_node.style.marginLeft = `${container.x}px`;
      if (container.y !== 0) dom_node.style.marginTop = `${container.y}px`;

      if (container.width > 1) {
        dom_node.style.width = `${container.width}px`;
      }
      if (container.height > 1) {
        dom_node.style.height = `${container.height}px`;
      }

      dom_node.append(...container.children.map(node => render(node)).filter(x => x != null));
      if (typeof container.props.color === 'object') {
        const clr = grt_node.props.color as { r: number; g: number; b: number; a: number; };
        dom_node.style.backgroundColor = `rgba(${clr.r}, ${clr.g}, ${clr.b}, ${clr.a / 255})`;
      }
    } break;

    case 'clip': {
      const scissor = grt_node as GrtContainerNode;
      dom_node = document.createElement('div');
      dom_node.append(...scissor.children.map(node => render(node)).filter(x => x != null));

      dom_node.style.position = 'absolute';
      if (scissor.x !== 0) dom_node.style.left = `${scissor.x}px`;
      if (scissor.y !== 0) dom_node.style.top = `${scissor.y}px`;

      if (scissor.width > 1) {
        dom_node.style.width = `${scissor.width}px`;
      }
      if (scissor.height > 1) {
        dom_node.style.height = `${scissor.height}px`;
      }

      dom_node.style.overflow = 'hidden';
      if (typeof scissor.props.color === 'object') {
        const clr = grt_node.props.color as { r: number; g: number; b: number; a: number; };
        dom_node.style.backgroundColor = `rgba(${clr.r}, ${clr.g}, ${clr.b}, ${clr.a / 255})`;
      }
    } break;

    case 'comment': {
      dom_node = document.createComment(grt_node.props.data ?? JSON.stringify(grt_node));
    } break;

    default: {
      dom_node = document.createComment(JSON.stringify(grt_node));
    } break;
  }
  if (dom_node && !(dom_node instanceof DocumentFragment)) {
    if (!grt_node.props) console.log(grt_node);
    for (const key of Object.keys(grt_node.props)) {
      if (key === 'color') continue;
      if (key in dom_node) {
        // @ts-ignore
        dom_node[key] = grt_node.props[key];
      }
    }
  }

  return dom_node;
}

