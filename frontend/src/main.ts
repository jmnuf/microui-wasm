import './style.css'
import type { GrtRootNode } from './grt';
import * as grt from './grt';
import { get_module, type RenderCommand } from './wasm-module';

grt.exec(function* () {
  const appDiv = document.getElementById('app');
  if (!appDiv) throw new Error('Missing app container element');
  const m = yield* get_module();
  console.log(m);
  m.exports.init();
  let tree = grt.createNode(':null');
  Object.defineProperty(window, 'tree', {
    get() { return tree }
  });
  let node = null;
  for (let i = 0; i < 2; ++i) {
    yield* grt.wait_anim_frame();
    m.exports.render_frame();
    m.exports.queue_commands();
    const new_tree = yield* drain_commands(m.ui_actions);
    const diff = tree.diff(new_tree);
    tree = new_tree;
    if (diff.kind === 'replace') {
      if (node) node.remove();
      node = grt.render(diff.item);
      if (!(node instanceof HTMLElement)) {
        throw new Error('Root element is required to be an HTMLElement');
      }
      if (node == null) {
        throw new Error('Root element is required to exist and be an HTMLElement but got null');
      }
      if (tree.child_count > 0) {
        console.log(`Tree has ${tree.child_count} children`);
        const first = tree.children[0];
        const elem = node.children[0];
        if (first.kind === 'container') {
          // @ts-ignore TS needs to shutup sometimes
          elem.style.position = 'absolute';
          console.log('elem', elem);
        }
        console.log('first('+first.kind+'): elem', elem);
      }
      if (!node) { throw new Error('Node required to continue'); }
      console.log(node);
      appDiv.append(node);
    } else if (diff.kind !== 'same') {
      throw new Error('TODO: Implement applying diff');
    }
  }
  // console.table(tree.children);
});

function* drain_commands(it: Generator<RenderCommand | null | undefined>) {
  const tree = grt.createNode(':root');
  let it_num = 0;
  const MAX_ITER = 1_000;
  let step = it.next();
  while (step.value != null) {
    if (it_num >= MAX_ITER) {
      yield grt.wait_event_frame();
      console.log(`Consumed ${it_num} commands, pausing from excessive commands in queue`);
      it_num = 0;
    }
    handle_command(tree, step.value);
    step = it.next();
    it_num++;
  }
  // console.log(`Consumed ${it_num} commands`);
  tree.collapse();
  console.table(tree.children);
  return tree;
}


function handle_command(tree: GrtNode, cmd: RenderCommand) {
  switch (cmd.type) {
    case 'rect': {
      const node = grt.createNode('container', {
        x: cmd.rect.x,
        y: cmd.rect.y,
        width: cmd.rect.width,
        height: cmd.rect.height,
        color: cmd.color,
      });
      tree.append(node);
      return node;
    } break;


    case 'text': {
      const node = grt.createNode(':text', { data: cmd.text.str, x: cmd.pos.x, y: cmd.pos.y, color: cmd.color });
      tree.append(node);
      return node;
    } break;

    case 'clip': {
      const node = grt.createNode('clip', {
        x: cmd.rect.x,
        y: cmd.rect.y,
        width: cmd.rect.width,
        height: cmd.rect.height,
        bounds: cmd.rect,
      });
      tree.append(node);
      return node;
    } break;

    case 'unclip': {
      const node = grt.createNode('unclip', {});
      tree.append(node);
      return node;
    } break;

    case 'ui:init': {
      const blocks = (cmd as unknown as { blocks: Array<RenderCommand> }).blocks;
      console.log('ui:init', blocks)
    } break;

    case 'win:init': {
      const blocks = (cmd as unknown as { blocks: Array<RenderCommand> }).blocks;
      console.log('win:init', blocks)
    } break;

    case 'win:end': {
      const blocks = (cmd as unknown as { blocks: Array<RenderCommand> }).blocks;
      console.log(blocks);
      const win = handle_command(tree, blocks[0]!)!;
      win.append(grt.createNode('comment',  { data: 'window' }));
      const frame = handle_command(win, blocks[1]);
      frame.append(grt.createNode('comment', { data: 'frame' }));
      frame.y -= win.y;
      for (let i = 2; i < blocks.length; ++i) {
        handle_command(frame, blocks[i]);
      }
      frame.collapse();
      for (const child of frame.children) {
        if (typeof child.y === 'number') {
          child.y -= frame.y;
        }
        if (typeof child.x === 'number') {
          child.x -= frame.x;
        }
      }
      console.log('win:end', win.children)
      return win;
    } break;

    case 'ui:end': {
      const blocks = (cmd as unknown as { blocks: Array<RenderCommand> }).blocks;
      console.log('ui:end', blocks)
    } break;

    default: console.log('Unsupported command type:', cmd.type); break;
  }
}

