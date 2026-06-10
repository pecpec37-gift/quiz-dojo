// ============================================================
// 早押しクイズ道場 - メインアプリケーション v2
// ============================================================

const App = (() => {

  // ============================
  // STATE
  // ============================
  const state = {
    currentScreen: 'top',
    selectedGenre: null,
    questions: [],        // 出題リスト（不適正除外済み）
    currentQ: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    wrongList: [],
    timeLeft: 120,
    timerInterval: null,
    displayedText: '',    // タイプライターで表示中のテキスト
    typingTimeout: null,
    typingDone: false,    // タイプライター完了フラグ
    currentChoices: [],   // 現在の4択選択肢
    answerPhase: false,   // 選択肢表示中フラグ
  };

  const TOTAL_TIME = 120;
  const CORRECT_POINTS = 10;
  const CORRECT_TIME_BONUS = 5;
  const WRONG_TIME_PENALTY = 5;
  const QUESTIONS_PER_GAME = 30;
  const TYPING_SPEED = 90;

  const $ = id => document.getElementById(id);

  const screens = {
    top: $('screen-top'),
    game: $('screen-game'),
    final: $('screen-final'),
    ranking: $('screen-ranking'),
  };

  const navBtns = {
    top: $('nav-top'),
    ranking: $('nav-ranking'),
  };

  // ============================
  // 不適正フラグ管理
  // ============================
  function getInvalidKeys() {
    return JSON.parse(localStorage.getItem('quiz_invalid') || '[]');
  }

  function addInvalidKey(key) {
    const keys = getInvalidKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      localStorage.setItem('quiz_invalid', JSON.stringify(keys));
    }
  }

  // 問題のユニークキー生成（問題文の先頭40文字で識別）
  function qKey(q) {
    return (q.q || '').slice(0, 40);
  }

  // ============================
  // NAVIGATION
  // ============================
  function showScreen(id) {
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    if (screens[id]) screens[id].classList.add('active');
    state.currentScreen = id;
    Object.keys(navBtns).forEach(k => {
      navBtns[k] && navBtns[k].classList.toggle('active', k === id);
    });
  }

  function nav(target) {
    if (target === 'ranking') { renderRanking(); showScreen('ranking'); }
    else showScreen('top');
  }

  // ============================
  // INIT
  // ============================
  function init() {
    $('total-q-count').textContent = QUIZ_DATA.countAll().toLocaleString();
    buildGenreGrid();

    $('btn-answer').addEventListener('click', onAnswerBtn);
    $('btn-next').addEventListener('click', nextQuestion);
    $('btn-report-q').addEventListener('click', () => reportInvalid('q'));
    $('btn-report-a').addEventListener('click', () => reportInvalid('a'));
    $('btn-retry').addEventListener('click', retryGame);
    $('btn-go-top').addEventListener('click', () => { stopTimer(); showScreen('top'); });
    $('btn-clear-ranking').addEventListener('click', clearRanking);
  }

  // ============================
  // GENRE GRID
  // ============================
  function buildGenreGrid() {
    const grid = $('genre-grid');
    grid.innerHTML = '';
    const invalidKeys = getInvalidKeys();

    QUIZ_DATA.genres.forEach(genre => {
      let count;
      if (genre.id === 'random') {
        count = QUIZ_DATA.countAll();
      } else {
        const all = QUIZ_DATA.questions[genre.id] || [];
        count = all.filter(q => !invalidKeys.includes(qKey(q))).length;
      }

      const card = document.createElement('div');
      card.className = 'genre-card' + (genre.id === 'random' ? ' random' : '');
      card.innerHTML = `
        <div class="genre-icon">${genre.icon}</div>
        <div class="genre-label">${genre.label}</div>
        <div class="genre-count">${count}問</div>
      `;
      card.style.borderColor = genre.id === 'random' ? `${genre.color}66` : '';
      card.addEventListener('click', () => loadAndStartGame(genre));
      grid.appendChild(card);
    });
  }

  // ============================
  // GAME START
  // ============================
  function loadAndStartGame(genre) {
    state.selectedGenre = genre;

    // 不適正除外
    const invalidKeys = getInvalidKeys();
    const raw = QUIZ_DATA.getQuestions(genre.id, QUESTIONS_PER_GAME * 3);
    state.questions = raw
      .filter(q => !invalidKeys.includes(qKey(q)))
      .slice(0, QUESTIONS_PER_GAME);

    state.currentQ = 0;
    state.score = 0;
    state.correct = 0;
    state.wrong = 0;
    state.wrongList = [];
    state.timeLeft = TOTAL_TIME;
    state.answerPhase = false;

    showScreen('game');
    updateGameHeader();
    startTimer();
    showQuestion();
  }

  function retryGame() {
    if (state.selectedGenre) loadAndStartGame(state.selectedGenre);
  }

  // ============================
  // TIMER
  // ============================
  function startTimer() {
    stopTimer();
    updateTimerUI();
    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      updateTimerUI();
      if (state.timeLeft <= 0) { state.timeLeft = 0; updateTimerUI(); endGame(); }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  }

  function updateTimerUI() {
    const t = state.timeLeft;
    const tv = $('timer-value');
    const tf = $('timer-fill');
    tv.textContent = t;
    tf.style.width = (t / TOTAL_TIME * 100) + '%';
    tv.className = 'timer-value' + (t <= 10 ? ' danger' : t <= 30 ? ' warning' : '');
    tf.className = 'timer-fill' + (t <= 10 ? ' danger' : t <= 30 ? ' warning' : '');
  }

  function addTime(sec) {
    state.timeLeft = Math.max(0, Math.min(state.timeLeft + sec, 999));
    updateTimerUI();
  }

  // ============================
  // QUESTION DISPLAY
  // ============================
  function showQuestion() {
    if (state.currentQ >= state.questions.length) { endGame(); return; }

    const q = state.questions[state.currentQ];
    $('q-genre-label').textContent = state.selectedGenre?.label ?? '';
    $('q-num').textContent = state.currentQ + 1;
    $('q-total').textContent = state.questions.length;

    // リセット
    state.answerPhase = false;
    state.typingDone = false;
    state.displayedText = '';
    const questionEl = $('question-text');
    questionEl.style.visibility = 'visible';
    questionEl.style.opacity = '1';
    questionEl.style.transition = 'none';
    $('btn-answer').style.display = 'block';
    $('btn-answer').disabled = false;
    $('btn-answer').textContent = '⚡ 回答する！';
    $('btn-report-q').style.display = 'inline-block';
    $('choices-area').innerHTML = '';
    $('choices-area').style.display = 'none';
    $('result-overlay').classList.remove('show');

    // タイプライター（回答ボタンを押しても止めない）
    typeQuestion(q.q, $('question-text'));
  }

  function typeQuestion(text, el) {
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    state.typingDone = false;
    let i = 0;

    function next() {
      if (i < text.length) {
        state.displayedText += text[i];
        i++;
        el.innerHTML = escapeHtml(state.displayedText) + '<span class="cursor-blink"></span>';
        state.typingTimeout = setTimeout(next, TYPING_SPEED);
      } else {
        state.typingDone = true;
        el.innerHTML = escapeHtml(state.displayedText);
      }
    }
    next();
  }

  // ============================
  // 4択生成（dummy優先 → type同一フォールバック）
  // ============================
  function buildChoices(correctQ) {
    const correctAnswer = correctQ.a;
    let dummyLabels = [];

    // ① dummyが設定されていればそれを使う
    if (correctQ.dummy && correctQ.dummy.length >= 3) {
      dummyLabels = correctQ.dummy.slice(0, 3).sort(() => Math.random() - 0.5);
    } else {
      // ② typeが一致する他の問題の正解をダミーに使う
      const qType = correctQ.type || 'thing';
      let pool = [];
      Object.values(QUIZ_DATA.questions).forEach(arr => {
        arr.forEach(q => {
          if (q.type === qType && q.a !== correctAnswer && !pool.includes(q.a)) {
            pool.push(q.a);
          }
        });
      });
      // 不足なら全問題から補充
      if (pool.length < 3) {
        Object.values(QUIZ_DATA.questions).forEach(arr => {
          arr.forEach(q => {
            if (q.a !== correctAnswer && !pool.includes(q.a)) pool.push(q.a);
          });
        });
      }
      // シャッフルして3つ選ぶ
      pool = pool.sort(() => Math.random() - 0.5);
      dummyLabels = pool.slice(0, 3);
    }

    // 4択に組み立ててシャッフル
    const choices = [
      { label: correctAnswer, correct: true },
      ...dummyLabels.map(label => ({ label, correct: false }))
    ].sort(() => Math.random() - 0.5);

    return choices;
  }

  // ============================
  // 回答ボタン押下
  // ============================
  function onAnswerBtn() {
    if (state.answerPhase) return;
    state.answerPhase = true;

    $('btn-answer').style.display = 'none';
    $('btn-report-q').style.display = 'none';

    // タイプライターを止めて問題文を非表示にする
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    const questionEl = $('question-text');
    questionEl.style.visibility = 'hidden';
    questionEl.style.opacity = '0';
    questionEl.style.transition = 'opacity 0.2s ease';

    // 選択肢を生成して表示
    const q = state.questions[state.currentQ];
    state.currentChoices = buildChoices(q);
    renderChoices(state.currentChoices);
  }

  function renderChoices(choices) {
    const area = $('choices-area');
    area.innerHTML = '';
    area.style.display = 'grid';

    choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerHTML = `<span class="choice-label">${['Ａ','Ｂ','Ｃ','Ｄ'][idx]}</span><span class="choice-text">${escapeHtml(choice.label)}</span>`;
      btn.addEventListener('click', () => onChoiceSelect(choice, btn, choices));
      area.appendChild(btn);
    });
  }

  function onChoiceSelect(choice, selectedBtn, choices) {
    // 全ボタン無効化
    const btns = $('choices-area').querySelectorAll('.choice-btn');
    btns.forEach(b => b.disabled = true);

    // 正解・不正解の色付け
    btns.forEach((b, idx) => {
      if (choices[idx].correct) {
        b.classList.add('choice-correct');
      } else if (b === selectedBtn && !choice.correct) {
        b.classList.add('choice-wrong');
      }
    });

    // 問題文を全文表示して再表示
    const q = state.questions[state.currentQ];
    const questionEl = $('question-text');
    questionEl.innerHTML = escapeHtml(q.q);
    questionEl.style.transition = 'opacity 0.3s ease';
    questionEl.style.visibility = 'visible';
    questionEl.style.opacity = '1';
    state.displayedText = q.q;
    state.typingDone = true;

    // 結果表示（少し待ってオーバーレイ）
    setTimeout(() => showResult(choice.correct, state.questions[state.currentQ], choice.label), 600);
  }

  // ============================
  // RESULT
  // ============================
  function showResult(isCorrect, q, userAnswer) {
    const box = $('result-box');
    box.className = 'result-box ' + (isCorrect ? 'correct' : 'incorrect');
    $('result-emoji').textContent = isCorrect ? '✅' : '❌';
    $('result-label').textContent = isCorrect ? '正解！' : '不正解...';
    $('result-q-text').textContent = q.q;   // 問題文の全文
    $('result-a-text').textContent = q.a;

    if (isCorrect) {
      state.score += CORRECT_POINTS;
      state.correct++;
      addTime(CORRECT_TIME_BONUS);
      $('result-feedback').innerHTML =
        `<span class="highlight plus">+${CORRECT_POINTS}点</span>　` +
        `<span class="highlight plus">残り時間 +${CORRECT_TIME_BONUS}秒！</span>`;
      showToast(`✅ 正解！ +10点 +${CORRECT_TIME_BONUS}秒`, 'positive');
    } else {
      state.wrong++;
      state.wrongList.push(q);
      addTime(-WRONG_TIME_PENALTY);
      $('result-feedback').innerHTML =
        `あなたの回答：「${escapeHtml(userAnswer)}」<br>` +
        `正解は <span class="highlight">「${escapeHtml(q.a)}」</span>　` +
        `<span class="highlight minus">（-${WRONG_TIME_PENALTY}秒）</span>`;
      showToast(`❌ 不正解 -${WRONG_TIME_PENALTY}秒`, 'negative');
    }

    updateGameHeader();
    $('result-overlay').classList.add('show');
  }

  function updateGameHeader() {
    $('score-disp').textContent = state.score;
  }

  // ============================
  // 不適正報告
  // ============================
  function reportInvalid(type) {
    const q = state.questions[state.currentQ];
    if (!q) return;
    const msg = type === 'q'
      ? `「問題文が不適正」としてフラグを立てます。\n\n問題：${q.q}\n\n次回から出題されません。よろしいですか？`
      : `「正解が不適正」としてフラグを立てます。\n\n正解：${q.a}\n\n次回から出題されません。よろしいですか？`;
    if (!confirm(msg)) return;

    addInvalidKey(qKey(q));
    showToast('🚩 不適正フラグを記録しました', '');

    if (type === 'q') {
      // 問題画面から → 次の問題へスキップ
      $('result-overlay').classList.remove('show');
      state.currentQ++;
      if (state.currentQ >= state.questions.length || state.timeLeft <= 0) endGame();
      else { state.answerPhase = false; showQuestion(); }
    } else {
      // 結果画面から → 次へ進む
      nextQuestion();
    }
  }

  // ============================
  // NEXT QUESTION
  // ============================
  function nextQuestion() {
    $('result-overlay').classList.remove('show');
    // トーストを即消す（次の問題文に重ならないように）
    clearTimeout(toastTimeout);
    $('feedback-toast').classList.remove('show');
    state.currentQ++;
    if (state.currentQ >= state.questions.length || state.timeLeft <= 0) endGame();
    else showQuestion();
  }

  // ============================
  // END GAME
  // ============================
  function endGame() {
    stopTimer();
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    $('result-overlay').classList.remove('show');

    const bonus = Math.max(0, state.timeLeft);
    const total = state.score + bonus;

    const accuracy = state.correct / Math.max(1, state.correct + state.wrong);
    let trophy = '🏆';
    if (accuracy >= 0.9 && total >= 200) trophy = '👑';
    else if (accuracy < 0.3 && state.correct + state.wrong > 0) trophy = '😢';

    $('final-trophy').textContent = trophy;
    $('final-score').textContent = total;
    $('final-correct').textContent = state.correct;
    $('final-wrong').textContent = state.wrong;
    $('final-bonus').textContent = '+' + bonus;

    const wl = $('wrong-list');
    const ws = $('wrong-list-section');

    if (state.correct === 0 && state.wrong === 0) {
      ws.innerHTML = '<div class="empty-state"><div class="emoji">⏱</div><p>時間切れです。ジャンルを選んで挑戦してみましょう！</p></div>';
    } else if (state.wrongList.length === 0) {
      ws.innerHTML = '<div class="empty-state"><div class="emoji">🎉</div><p>全問正解！完璧です！</p></div>';
    } else {
      wl.innerHTML = '';
      state.wrongList.forEach((q, i) => {
        const item = document.createElement('div');
        item.className = 'wrong-item';
        item.style.animationDelay = `${i * 0.05}s`;
        item.innerHTML = `
          <div class="wrong-item-q">Q. ${escapeHtml(q.q)}</div>
          <div class="wrong-item-a">✅ 正解：${escapeHtml(q.a)}</div>
        `;
        wl.appendChild(item);
      });
    }

    saveRanking(total, state.correct, state.selectedGenre);
    showScreen('final');
  }

  // ============================
  // BACK TO TOP
  // ============================
  function backToTop() {
    if (!confirm('ゲームを中断してTOPに戻りますか？\n（スコアは記録されません）')) return;
    stopTimer();
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    $('result-overlay').classList.remove('show');
    showScreen('top');
  }

  // ============================
  // RANKING
  // ============================
  function saveRanking(score, correct, genre) {
    const rankings = JSON.parse(localStorage.getItem('quiz_ranking') || '[]');
    rankings.push({
      score, correct,
      genre: genre?.label ?? 'ランダム',
      icon: genre?.icon ?? '🎲',
      date: new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    rankings.sort((a, b) => b.score - a.score);
    rankings.splice(20);
    localStorage.setItem('quiz_ranking', JSON.stringify(rankings));
  }

  function renderRanking() {
    const rankings = JSON.parse(localStorage.getItem('quiz_ranking') || '[]');
    const list = $('ranking-list');
    if (rankings.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🏆</div><p>まだ記録がありません<br>クイズに挑戦してみよう！</p></div>';
      return;
    }
    list.innerHTML = '';
    rankings.forEach((r, i) => {
      let rankClass = '', rankDisplay = i + 1;
      if (i === 0) { rankDisplay = '🥇'; rankClass = 'gold'; }
      else if (i === 1) { rankDisplay = '🥈'; rankClass = 'silver'; }
      else if (i === 2) { rankDisplay = '🥉'; rankClass = 'bronze'; }
      const item = document.createElement('div');
      item.className = 'ranking-item';
      item.style.animationDelay = `${i * 0.04}s`;
      item.innerHTML = `
        <div class="rank-num ${rankClass}">${rankDisplay}</div>
        <div class="rank-info">
          <div class="rank-genre">${r.icon} ${r.genre}</div>
          <div class="rank-date">${r.date}</div>
        </div>
        <div style="text-align:right">
          <div class="rank-score">${r.score}</div>
          <div class="rank-correct">✅ ${r.correct}問正解</div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  function clearRanking() {
    if (confirm('ランキングをリセットしますか？')) {
      localStorage.removeItem('quiz_ranking');
      renderRanking();
    }
  }

  // ============================
  // 不適正リスト表示（管理用）
  // ============================
  function showInvalidList() {
    const keys = getInvalidKeys();
    if (keys.length === 0) { alert('不適正フラグの問題はありません。'); return; }
    alert(`不適正フラグ数：${keys.length}件\n\n` + keys.map((k, i) => `${i+1}. ${k}...`).join('\n'));
  }

  // ============================
  // TOAST
  // ============================
  let toastTimeout;
  function showToast(msg, type) {
    const toast = $('feedback-toast');
    toast.textContent = msg;
    toast.className = 'feedback-toast show ' + (type || '');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // ============================
  // HELPERS
  // ============================
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { nav, init, backToTop, showInvalidList };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
