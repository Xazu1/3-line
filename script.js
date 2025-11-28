// --- Setup & Utilities ---
lucide.createIcons();

const views = {
    new: document.getElementById('view-new'),
    history: document.getElementById('view-history')
};
const navBtns = {
    new: document.getElementById('nav-new'),
    history: document.getElementById('nav-history')
};
const form = document.getElementById('reflection-form');
const historyList = document.getElementById('history-list'); // Changed id from grid to list
const emptyState = document.getElementById('empty-state');
const heatmapGrid = document.getElementById('heatmap-grid');

// Auto-resize textareas
const textareas = document.querySelectorAll('textarea');
textareas.forEach(el => {
    el.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
});

// Set Date (Japanese Format)
const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
document.getElementById('current-date').innerText = new Date().toLocaleDateString('ja-JP', dateOptions).toUpperCase();

// --- Animations (GSAP) ---

function animateInViewNew() {
    const tl = gsap.timeline();
    tl.fromTo("#view-new h1", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" })
        .fromTo("#view-new p", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, "-=0.6")
        .fromTo(".input-group", { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.15, duration: 0.8, ease: "power3.out" }, "-=0.6")
        .fromTo("button[type='submit']", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "-=0.4");
}

// Initial Load Animation
animateInViewNew();

// --- View Switching Logic ---
window.switchView = (viewName) => {
    // Update Nav
    Object.values(navBtns).forEach(btn => btn.classList.remove('active'));
    navBtns[viewName].classList.add('active');

    // Crossfade Views
    const activeView = viewName === 'new' ? views.new : views.history;
    const inactiveView = viewName === 'new' ? views.history : views.new;

    gsap.to(inactiveView, {
        opacity: 0,
        y: -20,
        duration: 0.4,
        display: 'none',
        onComplete: () => {
            if (viewName === 'history') {
                renderHistory();
                renderHeatmap();
            }

            gsap.set(activeView, { display: 'block', y: 20 });
            gsap.to(activeView, {
                opacity: 1,
                y: 0,
                duration: 0.6,
                ease: "power3.out",
                onComplete: () => {
                    if (viewName === 'history') {
                        lucide.createIcons();
                        // Stagger animation for new list items
                        gsap.fromTo(".entry-card",
                            { y: 20, opacity: 0 },
                            { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: "power2.out", clearProps: "all" }
                        );
                    }
                }
            });
        }
    });
};

// --- Data Management (LocalStorage) ---

function getReflections() {
    return JSON.parse(localStorage.getItem('3point_reflections') || '[]');
}

function saveReflection(data) {
    const reflections = getReflections();
    reflections.unshift(data); // Add to top
    localStorage.setItem('3point_reflections', JSON.stringify(reflections));
}

function deleteReflection(id, cardElement) {
    // Animate collapse before deletion
    gsap.to(cardElement, {
        height: 0,
        opacity: 0,
        marginBottom: 0,
        duration: 0.4,
        ease: "power3.in",
        onComplete: () => {
            const reflections = getReflections().filter(r => r.id !== id);
            localStorage.setItem('3point_reflections', JSON.stringify(reflections));
            renderHistory();
            renderHeatmap();
        }
    });
}

function updateReflection(id, updatedData) {
    const reflections = getReflections();
    const index = reflections.findIndex(r => r.id === id);
    if (index !== -1) {
        reflections[index] = { ...reflections[index], ...updatedData };
        localStorage.setItem('3point_reflections', JSON.stringify(reflections));
        renderHistory();
        renderHeatmap();
    }
}

// --- Form Handling ---

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const eventVal = document.getElementById('input-event').value.trim();
    const winVal = document.getElementById('input-win').value.trim();
    const nextVal = document.getElementById('input-next').value.trim();

    if (!eventVal || !winVal || !nextVal) {
        // Simple shake animation for error
        gsap.to(form, { x: [-5, 5, -5, 5, 0], duration: 0.4 });
        return;
    }

    const now = new Date();
    const newEntry = {
        id: Date.now(),
        // Store ISO string for easier date manipulation in heatmap
        isoDate: now.toISOString().split('T')[0],
        date: now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
        event: eventVal,
        win: winVal,
        next: nextVal,
        winLength: winVal.length // Store length for heatmap intensity
    };

    saveReflection(newEntry);

    // Success Animation
    const overlay = document.getElementById('success-overlay');
    const content = document.getElementById('success-content');

    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.3 })
        .fromTo(content, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" })
        .to(overlay, {
            opacity: 0, delay: 1.2, duration: 0.5, onComplete: () => {
                form.reset();
                // Reset heights
                textareas.forEach(t => t.style.height = 'auto');
                switchView('history');
            }
        });
});

// --- Render Heatmap ---
function renderHeatmap() {
    heatmapGrid.innerHTML = '';
    const reflections = getReflections();

    // 1. Prepare data map: date -> intensity score
    const activityMap = {};
    reflections.forEach(r => {
        // Use Win length as a proxy for intensity, cap at a reasonable number
        const score = Math.min(r.winLength ? Math.ceil(r.winLength / 20) : 1, 4);
        // If multiple entries per day, take the max score
        activityMap[r.isoDate] = Math.max(activityMap[r.isoDate] || 0, score);
    });

    // 2. Generate grid for past X weeks (e.g., 16 weeks * 7 days)
    const today = new Date();
    // Adjust to ensure the grid ends on today or near today, aligned to weeks
    const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
    // Calculate start date: go back 15 weeks, then adjust to previous Sunday
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (15 * 7) - dayOfWeek);

    const totalDays = 16 * 7;

    for (let i = 0; i < totalDays; i++) {
        const CurrentDateSpan = new Date(startDate);
        CurrentDateSpan.setDate(startDate.getDate() + i);
        const isoString = CurrentDateSpan.toISOString().split('T')[0];

        const intensity = activityMap[isoString] || 0;
        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${intensity}`;
        // Add simple tooltip via title attribute
        cell.title = `${CurrentDateSpan.toLocaleDateString('ja-JP')}: ${intensity > 0 ? 'Recorded' : 'No entry'}`;

        heatmapGrid.appendChild(cell);
    }
}


// --- Render History (Collapsible) ---

function renderHistory() {
    const reflections = getReflections();
    historyList.innerHTML = '';

    if (reflections.length === 0) {
        emptyState.style.display = 'block';
        heatmapGrid.parentElement.style.display = 'none'; // Hide heatmap if empty
        return;
    } else {
        emptyState.style.display = 'none';
        heatmapGrid.parentElement.style.display = 'flex';
    }

    reflections.forEach(item => {
        const card = document.createElement('div');
        // Removed 'group' class to avoid conflict with hover styles on expanded state
        card.className = 'entry-card rounded-sm overflow-hidden mb-4 relative';

        const eventColor = 'text-gray-400';
        const winColor = 'text-amber-400';
        const nextColor = 'text-blue-400';

        // Truncate Win summary for the header
        const winSummary = item.win.length > 40 ? item.win.substring(0, 40) + '...' : item.win;

        card.innerHTML = `
            <!-- Collapsed Header (Always Visible) -->
            <div class="card-header p-5 flex justify-between items-center cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                <div class="flex-grow pr-4">
                     <div class="flex items-center gap-3 mb-1">
                        <span class="mono text-xs text-white/40 tracking-wider">${item.date}</span>
                     </div>
                     <div class="flex items-center gap-2">
                        <i data-lucide="sparkles" class="w-3 h-3 ${winColor} flex-shrink-0"></i>
                        <p class="text-sm font-medium ${winColor} line-clamp-1">${winSummary}</p>
                     </div>
                </div>
                <div class="chevron-icon transition-transform duration-300 text-white/30">
                     <i data-lucide="chevron-down" class="w-5 h-5"></i>
                </div>
            </div>

            <!-- Expanded Body (Hidden by default) -->
            <div class="card-body bg-black/20">
                <div class="p-6 md:p-8 flex flex-col gap-6 border-t border-white/5">
                    
                    <div class="space-y-1">
                        <span class="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-2">
                            <i data-lucide="circle" class="w-3 h-3 ${eventColor}"></i> Event (事実)
                        </span>
                        <p class="text-base font-light leading-relaxed ${eventColor} pl-5">${item.event}</p>
                    </div>

                    <div class="space-y-1">
                        <span class="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-2">
                            <i data-lucide="sparkles" class="w-3 h-3 ${winColor}"></i> Win (発見)
                        </span>
                        <p class="text-base font-light leading-relaxed ${winColor} pl-5">${item.win}</p>
                    </div>

                    <div class="space-y-1">
                        <span class="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-2">
                            <i data-lucide="arrow-right" class="w-3 h-3 ${nextColor}"></i> Next (次)
                        </span>
                        <p class="text-base font-light leading-relaxed ${nextColor} pl-5">${item.next}</p>
                    </div>

                     <div class="action-buttons flex justify-end gap-4 pt-4 border-t border-white/5 opacity-50 hover:opacity-100 transition-opacity">
                        <button class="edit-btn text-xs mono text-blue-400 flex items-center gap-1 hover:underline">
                            <i data-lucide="edit-2" class="w-3 h-3"></i> 編集
                        </button>
                        <button class="delete-btn text-xs mono text-red-400 flex items-center gap-1 hover:underline">
                            <i data-lucide="trash-2" class="w-3 h-3"></i> 削除する
                        </button>
                    </div>
                    <div class="edit-actions hidden flex justify-end gap-4 pt-4 border-t border-white/5">
                        <button class="cancel-btn text-xs mono text-white/60 flex items-center gap-1 hover:underline">
                            <i data-lucide="x" class="w-3 h-3"></i> キャンセル
                        </button>
                        <button class="save-btn text-xs mono text-green-400 flex items-center gap-1 hover:underline">
                            <i data-lucide="check" class="w-3 h-3"></i> 保存
                        </button>
                    </div>
                </div>
            </div>
        `;

        historyList.appendChild(card);

        // --- Add Interactions ---
        const header = card.querySelector('.card-header');
        const body = card.querySelector('.card-body');
        const chevron = card.querySelector('.chevron-icon');
        const deleteBtn = card.querySelector('.delete-btn');
        const editBtn = card.querySelector('.edit-btn');
        const saveBtn = card.querySelector('.save-btn');
        const cancelBtn = card.querySelector('.cancel-btn');
        const actionButtons = card.querySelector('.action-buttons');
        const editActions = card.querySelector('.edit-actions');

        const eventText = card.querySelector('.card-body .space-y-1:nth-child(1) p');
        const winText = card.querySelector('.card-body .space-y-1:nth-child(2) p');
        const nextText = card.querySelector('.card-body .space-y-1:nth-child(3) p');

        let isExpanded = false;
        let isEditing = false;
        let originalContent = {};

        header.addEventListener('click', () => {
            if (isEditing) return; // Prevent collapse during edit

            if (!isExpanded) {
                // Expand
                gsap.set(body, { height: 'auto' });
                gsap.from(body, { height: 0, duration: 0.4, ease: "power3.inOut" });
                gsap.to(chevron, { rotation: 180, duration: 0.3 });
                card.classList.add('bg-white/5'); // Keep highlight when open
            } else {
                // Collapse
                gsap.to(body, { height: 0, duration: 0.3, ease: "power3.inOut" });
                gsap.to(chevron, { rotation: 0, duration: 0.3 });
                card.classList.remove('bg-white/5');
            }
            isExpanded = !isExpanded;
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('本当に削除しますか？')) {
                deleteReflection(item.id, card);
            }
        });

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isEditing = true;

            // Store original content
            originalContent = {
                event: eventText.textContent,
                win: winText.textContent,
                next: nextText.textContent
            };

            // Make text editable
            eventText.contentEditable = true;
            winText.contentEditable = true;
            nextText.contentEditable = true;

            // Add editing styles
            [eventText, winText, nextText].forEach(el => {
                el.style.outline = '1px solid rgba(255, 255, 255, 0.2)';
                el.style.padding = '8px';
                el.style.borderRadius = '4px';
                el.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            });

            // Toggle buttons
            actionButtons.style.display = 'none';
            editActions.classList.remove('hidden');
            editActions.classList.add('flex');

            // Recreate icons after DOM changes
            lucide.createIcons();

            // Recalculate and update card height to show the new buttons
            gsap.set(body, { height: 'auto' });
            const newHeight = body.scrollHeight;
            gsap.from(body, { height: body.offsetHeight, duration: 0.3, ease: "power3.out" });
            gsap.to(body, { height: newHeight, duration: 0.3, ease: "power3.out" });
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Restore original content
            eventText.textContent = originalContent.event;
            winText.textContent = originalContent.win;
            nextText.textContent = originalContent.next;

            // Remove editable state
            eventText.contentEditable = false;
            winText.contentEditable = false;
            nextText.contentEditable = false;

            // Remove editing styles
            [eventText, winText, nextText].forEach(el => {
                el.style.outline = '';
                el.style.padding = '';
                el.style.borderRadius = '';
                el.style.backgroundColor = '';
            });

            // Toggle buttons
            actionButtons.style.display = 'flex';
            editActions.classList.add('hidden');
            editActions.classList.remove('flex');

            isEditing = false;

            // Recalculate card height after hiding edit buttons
            gsap.set(body, { height: 'auto' });
            const newHeight = body.scrollHeight;
            gsap.to(body, { height: newHeight, duration: 0.3, ease: "power3.out" });
        });

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Get updated content
            const updatedEvent = eventText.textContent.trim();
            const updatedWin = winText.textContent.trim();
            const updatedNext = nextText.textContent.trim();

            // Validate
            if (!updatedEvent || !updatedWin || !updatedNext) {
                alert('すべてのフィールドを入力してください。');
                return;
            }

            // Update data
            updateReflection(item.id, {
                event: updatedEvent,
                win: updatedWin,
                next: updatedNext,
                winLength: updatedWin.length
            });

            // Success animation
            gsap.fromTo(card,
                { scale: 1 },
                {
                    scale: 0.98,
                    duration: 0.15,
                    yoyo: true,
                    repeat: 1,
                    ease: "power2.inOut"
                }
            );

            isEditing = false;
        });

    });

}
