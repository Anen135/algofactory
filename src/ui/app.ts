import { levels } from '../content/levels';
import { createProgram } from '../code/ir';
import { JavaScriptGenerator, PythonGenerator } from '../code/generators';
import { serializeGraph } from '../core/graph';
import { parseValue } from '../core/values';
import type { FactoryScene } from '../renderer/factory-scene';
import type { GameState, StateChange } from '../state/game-state';
import { $, escape } from './helpers';
import { inspector, mapPanel, palette, testsPanel } from './panels';
import { template } from './template';
import { tutorialState } from './tutorial';
import { SoundFeedback } from './sound';
export class App {
  private scene?: FactoryScene;
  private tab = 'tests';
  private language = 'Python';
  private pending = false;
  private sound = new SoundFeedback();
  constructor(readonly state: GameState) { $('#app').innerHTML = template; this.bind(); this.renderAll(); state.subscribe(change => this.changed(change)); }
  attachScene(scene: FactoryScene): void { this.scene = scene; }
  private bind(): void {
    document.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action; if (action) this.action(action);
      const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab; if (tab) { this.tab = tab; this.renderTab(); }
      const level = target.closest<HTMLElement>('[data-level]')?.dataset.level; if (level) { this.state.loadLevel(level); $<HTMLDialogElement>('#modal').close(); }
      const machine = target.closest<HTMLElement>('[data-machine]')?.dataset.machine; if (machine) this.scene?.addAtCenter(machine);
    });
    document.addEventListener('change', event => {
      const target = event.target as HTMLInputElement;
      if (target.id === 'speed') this.state.speed = Number(target.value);
      if (target.id === 'sample') { this.state.sample = Number(target.value); this.renderTab(); }
      if (target.id === 'language') { this.language = target.value; this.renderTab(); }
      if (target.id === 'sound') { this.sound.enabled = target.checked; this.sound.play(true); }
      if (target.dataset.config && this.state.selected) {
        try { this.state.configure(this.state.selected, target.dataset.config, target.dataset.kind === 'value' ? parseValue(target.value) : target.value); $('#inspector-content').innerHTML = inspector(this.state); }
        catch (e) { this.state.report((e as Error).message); target.classList.add('invalid'); }
      }
    });
    $('#palette-list').addEventListener('dragstart', event => { const e = event as DragEvent; const type = (e.target as HTMLElement).closest<HTMLElement>('[data-machine]')?.dataset.machine; if (type && e.dataTransfer) { e.dataTransfer.setData('application/x-data-factory', type); e.dataTransfer.effectAllowed = 'copy'; } });
    $('#game').addEventListener('dragover', event => event.preventDefault());
    $('#game').addEventListener('drop', event => { event.preventDefault(); const e = event as DragEvent; const type = e.dataTransfer?.getData('application/x-data-factory'); if (type && this.scene) { const rect = $('#game').getBoundingClientRect(), p = this.scene.world(e.clientX - rect.left, e.clientY - rect.top); this.state.addMachine(type, p.x - 90, p.y - 45); } });
    $('#import-file').addEventListener('change', event => { const element = event.target as HTMLInputElement, file = element.files?.[0]; if (file) { if (file.size > 2_000_000) this.state.report('Файл слишком большой (максимум 2 МБ).'); else void file.text().then(text => this.state.import(text)).catch(() => this.state.report('Не удалось прочитать файл.')); } element.value = ''; });
    document.addEventListener('keydown', event => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') || $<HTMLDialogElement>('#modal').open) return;
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); if (event.shiftKey) this.state.redo(); else this.state.undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); this.state.save(); this.state.report('Фабрика сохранена локально.'); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.state.removeSelected(); }
      else if (event.key === 'Escape') { this.scene?.cancelConnection(); this.state.select(); }
      else if (event.code === 'KeyF') this.scene?.fit();
      else if (event.code === 'KeyR') this.state.run();
      else if (event.code === 'Period') this.state.step();
    });
  }
  private action(action: string): void {
    const actions: Record<string, () => void> = {
      run: () => this.state.run(), step: () => this.state.step(), edit: () => this.state.edit(), undo: () => this.state.undo(), redo: () => this.state.redo(), clear: () => this.state.clear(), remove: () => this.state.removeSelected(),
      check: () => { this.state.checkTests(); this.tab = 'tests'; this.renderTab(); }, fit: () => this.scene?.fit(), 'zoom-in': () => this.scene?.zoom(1.2), 'zoom-out': () => this.scene?.zoom(1 / 1.2),
      export: () => { const url = URL.createObjectURL(new Blob([serializeGraph(this.state.graph)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${this.state.level.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
      import: () => $<HTMLInputElement>('#import-file').click(), map: () => this.openModal('Карта обучения', mapPanel(this.state)), 'close-modal': () => $<HTMLDialogElement>('#modal').close(),
      next: () => { const index = levels.indexOf(this.state.level); if (index < levels.length - 1) this.state.loadLevel(levels[index + 1].id); else this.openModal('Карта обучения', mapPanel(this.state)); },
      hint: () => this.openModal('Подсказка', `<p>${escape(this.state.level.hint)}</p><p class="muted">Один выход может питать несколько входов. Для удаления связи выберите линию и нажмите Delete.</p>`),
      help: () => this.openModal('Как устроена фабрика', `<div class="help-grid"><div><h3>Соберите алгоритм</h3><p>Перетащите машину из каталога или нажмите на неё. Соедините выход справа со входом слева: перетаскиванием или двумя нажатиями. Параметры — в инспекторе.</p><h3>Управление</h3><p>Пробел + мышь / правая кнопка — панорама.<br>Колесо — масштаб. F — вписать.<br>Delete — удалить выбранное.<br>Ctrl+Z / Ctrl+Shift+Z — отмена / повтор.<br>R — запуск / пауза. Точка — один шаг.</p></div><div><h3>Наблюдайте за вычислением</h3><p>Шаг выполняет одно действие: обработка, создание пакета, передача или закрытие потока. Выберите машину, чтобы увидеть входы и результаты.</p><p>Stack, Queue и Join ждут конца входа. Константа автоматически повторяется для всех элементов потока. Branch завершает обе ветки, включая пустую.</p><p>Каждый тест запускает чистую фабрику. Графовые циклы в MVP запрещены.</p></div></div>`),
      settings: () => this.openModal('Настройки', `<label class="setting"><input type="checkbox" id="sound" ${this.sound.enabled ? 'checked' : ''}/> Звук результата проверки</label><p>Граф и прогресс автоматически сохраняются в этом браузере. Используйте ⇩ / ⇧ для переноса решения в JSON.</p><p class="muted">Скорость и Instant доступны над полем. Основной режим — desktop, от 1100 px.</p>`),
    };
    actions[action]?.();
  }
  private changed(change: StateChange): void {
    if (change.kind === 'runtime') { if (!change.event) { this.renderTab(); this.renderControls(); } if (!this.pending) { this.pending = true; setTimeout(() => { this.pending = false; this.renderControls(); $('#inspector-content').innerHTML = inspector(this.state); if (this.tab === 'console') this.renderTab(); }, 80); } return; }
    if (change.kind === 'results') this.sound.play(!!this.state.result?.passed);
    if (change.kind === 'selection') { $('#inspector-content').innerHTML = inspector(this.state); return; }
    if (change.kind === 'message') { this.renderStatus(); return; }
    this.renderAll();
  }
  private renderAll(): void { this.renderLevel(); $('#palette-list').innerHTML = palette(this.state); this.renderControls(); $('#inspector-content').innerHTML = inspector(this.state); this.renderTab(); this.renderStatus(); }
  private renderLevel(): void {
    const s = this.state, index = levels.indexOf(s.level);
    $('#level-name').textContent = s.level.name; $('#level-topic').textContent = s.level.topic; $('#level-number').textContent = String(index + 1).padStart(2, '0');
    $('#progress-label').innerHTML = `<span class="mint">${levels.filter(level => s.persistence.progress()[level.id]?.completed).length}</span> / ${levels.length} пройдено`; $('#machine-count').textContent = `${s.level.availableMachines.length} доступно`;
    $('#empty-state').hidden = !!s.graph.machines.length; $('#graph-count').textContent = `${s.graph.machines.length} машин · ${s.graph.connections.length} связей`;
    const tutorial = tutorialState(s); $('#tutorial').hidden = !tutorial;
    if (tutorial) $('#tutorial').innerHTML = `<span class="tutorial-icon">${tutorial.current === tutorial.count ? '✓' : '↳'}</span><div><small>ПЕРВЫЕ ШАГИ <span>${Math.min(tutorial.current + 1, tutorial.count)} / ${tutorial.count}</span></small><p>${escape(tutorial.text)}</p></div>`;
  }
  private renderControls(): void {
    const s = this.state, running = s.mode === 'RUN' && !s.simulation?.done;
    $('#mode').textContent = `● ${s.mode === 'EDIT' ? 'EDIT' : s.simulation?.done ? 'DONE' : s.paused ? 'PAUSED' : 'RUNNING'}`; $('#mode').classList.toggle('running', running);
    $('#run-btn').textContent = running ? s.paused ? '▶ Продолжить' : 'Ⅱ Пауза' : '▶ RUN';
    $<HTMLButtonElement>('#edit-btn').disabled = s.mode === 'EDIT'; $<HTMLButtonElement>('#undo-btn').disabled = !s.canUndo; $<HTMLButtonElement>('#redo-btn').disabled = !s.canRedo; $<HTMLButtonElement>('#check-btn').disabled = running;
    $('#stats-line').textContent = `${s.simulation?.operations ?? 0} операций · ${s.simulation?.ticks ?? 0} тиков`;
    const eventLabels = { process: 'Обработка', emit: 'Создание пакета', transfer: 'Передача пакета', close: 'Конец потока', done: 'Готово', error: 'Ошибка' };
    if (s.mode === 'RUN' && s.lastEvent) $('#stats-line').textContent += ` · ${eventLabels[s.lastEvent.kind]}`;
    document.querySelectorAll<HTMLButtonElement>('[data-machine], [data-action="clear"], [data-action="import"]').forEach(button => { button.disabled = s.mode === 'RUN'; });
    const sample = document.querySelector<HTMLSelectElement>('#sample'); if (sample) sample.disabled = s.mode === 'RUN';
  }
  private renderTab(): void {
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
    const s = this.state; $('#test-count').textContent = s.result ? `${s.result.tests.filter(t => t.passed).length}/${s.result.tests.length}` : String(s.level.tests.length);
    if (this.tab === 'console') { $('#tab-content').innerHTML = `<div class="console">${s.log.length ? s.log.map(line => `<div><span>›</span> ${escape(line)}</div>`).join('') : '<span class="muted">События симуляции появятся здесь после запуска.</span>'}</div>`; $('#tab-content').scrollTop = $('#tab-content').scrollHeight; return; }
    if (this.tab === 'code') {
      let code: string; try { code = (this.language === 'Python' ? new PythonGenerator() : new JavaScriptGenerator()).generate(createProgram(s.graph)); } catch (e) { code = `# Соберите корректную фабрику для просмотра кода.\n# ${(e as Error).message.replaceAll('\n', '\n# ')}`; }
      $('#tab-content').innerHTML = `<div class="code-toolbar"><span>FACTORY GRAPH → IR → CODE <small>Эквивалент вычисления; анимация и тики не включены.</small></span><select id="language" aria-label="Язык Code View"><option ${this.language === 'Python' ? 'selected' : ''}>Python</option><option ${this.language === 'JavaScript' ? 'selected' : ''}>JavaScript</option></select></div><pre class="code-view"><code>${escape(code)}</code></pre>`; return;
    }
    $('#tab-content').innerHTML = testsPanel(s);
  }
  private renderStatus(): void { $('#status-message').textContent = this.state.message; $('#status-message').title = this.state.message; $('#save-status').innerHTML = this.state.persistence.warning ? 'СОХРАНЕНИЕ НЕДОСТУПНО' : 'LOCAL AUTOSAVE <i class="status-dot"></i>'; }
  private openModal(title: string, content: string): void { $('#modal-title').textContent = title; $('#modal-content').innerHTML = content; $<HTMLDialogElement>('#modal').showModal(); }
}
