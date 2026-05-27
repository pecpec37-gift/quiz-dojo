// ============================================================
// 早押しクイズ道場 - メインアプリケーション
// ============================================================

const App = (() => {

  // ============================
  // STATE
  // ============================
  const state = {
    currentScreen: 'top',
    selectedGenre: null,
    questions: [],
    currentQ: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    wrongList: [],
    timeLeft: 120,
    timerInterval: null,
    speechRecognition: null,
    speechActive: false,
    currentAnswer: '',
    questionTyping: false,
    typingTimeout: null,
    useSpeech: true,
    displayedText: '',
    questionStartTime: 0,
    waitingConfirm: false,
  };

  const TOTAL_TIME = 120;
  const CORRECT_POINTS = 10;
  const CORRECT_TIME_BONUS = 5;
  const WRONG_TIME_PENALTY = 5;
  const QUESTIONS_PER_GAME = 30;
  const TYPING_SPEED = 80; // ms per char (ゆっくり読むスピード)

  // ============================
  // DOM REFS
  // ============================
  const $ = id => document.getElementById(id);

  const screens = {
    top: $('screen-top'),
    confirm: $('screen-confirm'),
    game: $('screen-game'),
    final: $('screen-final'),
    ranking: $('screen-ranking'),
  };

  const navBtns = {
    top: $('nav-top'),
    ranking: $('nav-ranking'),
  };

  // ============================
  // NAVIGATION
  // ============================
  function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[id].classList.add('active');
    state.currentScreen = id;

    // Nav highlight
    Object.keys(navBtns).forEach(k => {
      navBtns[k].classList.toggle('active', k === id);
    });
  }

  function nav(target) {
    if (target === 'ranking') {
      renderRanking();
      showScreen('ranking');
    } else {
      showScreen('top');
    }
  }

  // ============================
  // INIT
  // ============================
  function init() {
    // Count total questions
    $('total-q-count').textContent = QUIZ_DATA.countAll().toLocaleString();

    // Build genre grid
    buildGenreGrid();

    // Speech recognition support
    state.useSpeech = ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    if (!state.useSpeech) {
      $('speech-no-support').style.display = 'block';
    }

    // Event listeners
    $('btn-start-game').addEventListener('click', startGame);
    $('btn-back-top').addEventListener('click', () => showScreen('top'));
    $('btn-answer').addEventListener('click', onAnswerBtn);
    $('btn-speech-ok').addEventListener('click', onSpeechOK);
    $('btn-speech-ng').addEventListener('click', onSpeechNG);
    $('btn-next').addEventListener('click', nextQuestion);
    $('btn-retry').addEventListener('click', retryGame);
    $('btn-go-top').addEventListener('click', () => { stopTimer(); showScreen('top'); });
    $('btn-clear-ranking').addEventListener('click', clearRanking);
    $('manual-input').addEventListener('keydown', e => { if (e.key === 'Enter') onManualSubmit(); });
    $('btn-manual-submit').addEventListener('click', onManualSubmit);
  }

  // ============================
  // GENRE GRID
  // ============================
  function buildGenreGrid() {
    const grid = $('genre-grid');
    grid.innerHTML = '';

    QUIZ_DATA.genres.forEach(genre => {
      const count = genre.id === 'random'
        ? QUIZ_DATA.countAll()
        : (QUIZ_DATA.questions[genre.id]?.length ?? 0);

      const card = document.createElement('div');
      card.className = 'genre-card' + (genre.id === 'random' ? ' random' : '');
      card.style.setProperty('--card-color', genre.color);
      card.innerHTML = `
        <div class="genre-icon">${genre.icon}</div>
        <div class="genre-label">${genre.label}</div>
        <div class="genre-count">${count}問</div>
      `;
      card.style.borderColor = genre.id === 'random' ? `${genre.color}66` : '';
      card.addEventListener('click', () => selectGenre(genre));
      grid.appendChild(card);
    });
  }

  // ============================
  // GENRE SELECT → CONFIRM → GAME
  // ============================
  function selectGenre(genre) {
    state.selectedGenre = genre;

    // 即ゲーム開始（ConfirmはスキップしてOK）
    // → 要件「ジャンルカードをクリックしたら即ゲーム開始」
    loadAndStartGame(genre);
  }

  function loadAndStartGame(genre) {
    // 問題読み込み
    state.questions = QUIZ_DATA.getQuestions(genre.id, QUESTIONS_PER_GAME);
    state.currentQ = 0;
    state.score = 0;
    state.correct = 0;
    state.wrong = 0;
    state.wrongList = [];
    state.timeLeft = TOTAL_TIME;

    showScreen('game');
    updateGameHeader();
    startTimer();
    showQuestion();
  }

  function startGame() {
    if (!state.selectedGenre) return;
    loadAndStartGame(state.selectedGenre);
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
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateTimerUI();
        endGame();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTimerUI() {
    const t = state.timeLeft;
    const tv = $('timer-value');
    const tf = $('timer-fill');
    const pct = (t / TOTAL_TIME) * 100;

    tv.textContent = t;
    tf.style.width = pct + '%';

    // Color states
    tv.className = 'timer-value';
    tf.className = 'timer-fill';

    if (t <= 10) {
      tv.classList.add('danger');
      tf.classList.add('danger');
    } else if (t <= 30) {
      tv.classList.add('warning');
      tf.classList.add('warning');
    }
  }

  function addTime(sec) {
    state.timeLeft = Math.min(state.timeLeft + sec, 999);
    updateTimerUI();
  }

  // ============================
  // QUESTION DISPLAY
  // ============================
  function showQuestion() {
    if (state.currentQ >= state.questions.length) {
      endGame();
      return;
    }

    const q = state.questions[state.currentQ];
    const qText = $('question-text');
    const genre = QUIZ_DATA.genres.find(g => findGenreOfQuestion(q));
    $('q-genre-label').textContent = state.selectedGenre?.label ?? '';
    $('q-num').textContent = state.currentQ + 1;

    // Reset UI
    $('btn-answer').style.display = 'block';
    $('btn-answer').disabled = false;
    hideSpeechBox();
    $('manual-input-area').style.display = 'none';
    $('result-overlay').classList.remove('show');

    // Typing animation
    state.displayedText = '';
    state.questionStartTime = Date.now();
    state.waitingConfirm = false;
    typeQuestion(q.q, qText);
  }

  function typeQuestion(text, el) {
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    state.questionTyping = true;
    let i = 0;

    function next() {
      if (i < text.length) {
        state.displayedText += text[i];
        i++;
        el.innerHTML = escapeHtml(state.displayedText) + '<span class="cursor-blink"></span>';
        state.typingTimeout = setTimeout(next, TYPING_SPEED);
      } else {
        state.questionTyping = false;
        el.innerHTML = escapeHtml(state.displayedText);
      }
    }

    next();
  }

  function stopTyping() {
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    state.questionTyping = false;
    const q = state.questions[state.currentQ];
    if (q) {
      $('question-text').innerHTML = escapeHtml(q.q);
    }
    state.displayedText = q?.q ?? '';
  }

  // ============================
  // ANSWER BUTTON
  // ============================
  function onAnswerBtn() {
    // 問題のタイピングを即停止
    stopTyping();

    $('btn-answer').style.display = 'none';

    if (state.useSpeech) {
      startSpeechRecognition();
    } else {
      $('manual-input-area').style.display = 'block';
      $('manual-input').value = '';
      $('manual-input').focus();
    }
  }

  // ============================
  // SPEECH RECOGNITION
  // ============================
  function startSpeechRecognition() {
    $('speech-box').classList.add('active');
    $('speech-label').textContent = '🎙 聞いています...';
    $('speech-result').textContent = '　';
    $('speech-confirm').classList.remove('active');
    state.currentAnswer = '';
    state.speechActive = true;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    state.speechRecognition = recognition;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      const display = final || interim;
      $('speech-result').textContent = display || '　';

      if (final) {
        state.currentAnswer = final;
        $('speech-label').textContent = '✅ 認識完了';
        $('speech-confirm').classList.add('active');
        state.speechActive = false;
        state.waitingConfirm = true;
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      $('speech-label').textContent = '⚠️ 再度お試しください';
      state.speechActive = false;
      // フォールバック
      setTimeout(() => {
        hideSpeechBox();
        $('manual-input-area').style.display = 'block';
        $('manual-input').focus();
        $('speech-no-support').style.display = 'block';
        $('speech-no-support').textContent = '⚠️ 音声認識エラー。テキスト入力に切り替えます。';
        state.useSpeech = false;
      }, 800);
    };

    recognition.onend = () => {
      if (state.speechActive) {
        // 何も認識できなかった場合
        $('speech-label').textContent = '⚠️ もう一度話してください';
        state.speechActive = false;
        // 再起動
        setTimeout(() => startSpeechRecognition(), 600);
      }
    };

    recognition.start();
  }

  function hideSpeechBox() {
    $('speech-box').classList.remove('active');
    if (state.speechRecognition) {
      try { state.speechRecognition.abort(); } catch (e) {}
      state.speechRecognition = null;
    }
    state.speechActive = false;
  }

  function onSpeechOK() {
    // 音声認識結果をOKとして確定
    judgeAnswer(state.currentAnswer);
  }

  function onSpeechNG() {
    // 再回答
    $('speech-confirm').classList.remove('active');
    state.currentAnswer = '';
    state.speechActive = false;
    startSpeechRecognition();
  }

  // ============================
  // MANUAL INPUT
  // ============================
  function onManualSubmit() {
    const val = $('manual-input').value.trim();
    if (!val) return;
    judgeAnswer(val);
  }

  // ============================
  // JUDGE
  // ============================
  function judgeAnswer(userAnswer) {
    const q = state.questions[state.currentQ];
    if (!q) return;

    hideSpeechBox();
    $('manual-input-area').style.display = 'none';
    state.waitingConfirm = false;

    // 正誤判定（柔軟マッチ）
    const isCorrect = flexMatch(userAnswer, q.a);

    showResult(isCorrect, q, userAnswer);
  }

  function flexMatch(userInput, correctAnswer) {
    // 正規化
    const normalize = s => s
      .toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\s/g, '')
      .replace(/[、。！？!?・]/g, '');

    const u = normalize(userInput);
    const c = normalize(correctAnswer);

    if (u === c) return true;
    if (c.includes(u) && u.length >= 2) return true;
    if (u.includes(c)) return true;

    // カタカナ・ひらがな変換
    const toHira = s => s.replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
    if (toHira(u) === toHira(c)) return true;

    return false;
  }

  // ============================
  // RESULT DISPLAY
  // ============================
  function showResult(isCorrect, q, userAnswer) {
    const overlay = $('result-overlay');
    const box = $('result-box');

    box.className = 'result-box ' + (isCorrect ? 'correct' : 'incorrect');
    $('result-emoji').textContent = isCorrect ? '✅' : '❌';
    $('result-label').textContent = isCorrect ? '正解！' : '不正解...';
    $('result-q-text').textContent = q.q;
    $('result-a-text').textContent = q.a;

    if (isCorrect) {
      state.score += CORRECT_POINTS;
      state.correct++;
      addTime(CORRECT_TIME_BONUS);
      $('result-feedback').innerHTML = `
        <span class="highlight plus">+${CORRECT_POINTS}点</span>、
        <span class="highlight plus">残り時間+${CORRECT_TIME_BONUS}秒！</span>
      `;
      showToast(`✅ 正解！ +10点 +${CORRECT_TIME_BONUS}秒`, 'positive');
    } else {
      state.wrong++;
      state.wrongList.push(q);
      addTime(-WRONG_TIME_PENALTY);
      $('result-feedback').innerHTML = `
        あなたの回答：「${escapeHtml(userAnswer)}」<br>
        正解は <span class="highlight">「${escapeHtml(q.a)}」</span>
        <span class="highlight minus">（-${WRONG_TIME_PENALTY}秒）</span>
      `;
      showToast(`❌ 不正解 -${WRONG_TIME_PENALTY}秒`, 'negative');
    }

    updateGameHeader();
    overlay.classList.add('show');
  }

  function updateGameHeader() {
    $('score-disp').textContent = state.score;
    $('q-total').textContent = Math.min(state.questions.length, QUESTIONS_PER_GAME);
  }

  // ============================
  // NEXT QUESTION
  // ============================
  function nextQuestion() {
    $('result-overlay').classList.remove('show');
    state.currentQ++;

    if (state.currentQ >= state.questions.length || state.timeLeft <= 0) {
      endGame();
    } else {
      showQuestion();
    }
  }

  // ============================
  // END GAME
  // ============================
  function endGame() {
    stopTimer();
    hideSpeechBox();
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    $('result-overlay').classList.remove('show');

    // 残り時間ボーナス
    const bonus = Math.max(0, state.timeLeft);
    const total = state.score + bonus;

    // Trophy
    let trophy = '🏆';
    const accuracy = state.correct / Math.max(1, state.correct + state.wrong);
    if (accuracy >= 0.9 && total >= 200) trophy = '👑';
    else if (accuracy < 0.3) trophy = '😢';

    $('final-trophy').textContent = trophy;
    $('final-score').textContent = total;
    $('final-correct').textContent = state.correct;
    $('final-wrong').textContent = state.wrong;
    $('final-bonus').textContent = '+' + bonus;

    // Wrong list
    const wl = $('wrong-list');
    const ws = $('wrong-list-section');

    if (state.wrongList.length === 0) {
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

    // Save ranking
    saveRanking(total, state.correct, state.selectedGenre);

    showScreen('final');
  }

  // ============================
  // RETRY
  // ============================
  function retryGame() {
    if (state.selectedGenre) {
      loadAndStartGame(state.selectedGenre);
    }
  }

  // ============================
  // RANKING
  // ============================
  function saveRanking(score, correct, genre) {
    const rankings = JSON.parse(localStorage.getItem('quiz_ranking') || '[]');
    rankings.push({
      score,
      correct,
      genre: genre?.label ?? 'ランダム',
      icon: genre?.icon ?? '🎲',
      date: new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    rankings.sort((a, b) => b.score - a.score);
    rankings.splice(20); // Top 20
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
      let rankClass = '';
      let rankDisplay = i + 1;
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
  // TOAST
  // ============================
  let toastTimeout;
  function showToast(msg, type) {
    const toast = $('feedback-toast');
    toast.textContent = msg;
    toast.className = 'feedback-toast show ' + (type || '');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // ============================
  // HELPERS
  // ============================
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findGenreOfQuestion(q) {
    for (const [key, arr] of Object.entries(QUIZ_DATA.questions)) {
      if (arr.includes(q)) return key;
    }
    return null;
  }

  // ============================
  // PUBLIC
  // ============================
  return { nav, init };
})();

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
