function toggleExtra(button) {
    const container = button.parentElement;
    const extra = container.querySelector('.extra-buttons');
    extra.classList.toggle('hidden');
}
