let linksall=localStorage.getItem('links'); linksall=JSON.parse(linksall); 
const currentLink = linksall.shift()
localStorage.setItem('links',JSON.stringify(linksall));
let allemails=localStorage.getItem('emails');allemails=JSON.parse(allemails); 
let emails = document.querySelectorAll('div a[class="text-brand-magenta underline underline-offset-2"]'); 
emails= Array.from(emails) .map(link => link.innerText) .filter(href => href.includes('@')); 
allemails.push(...emails); 
allemails=[...new Set(allemails)]; 
localStorage.setItem('emails',JSON.stringify(allemails)); console.log(allemails);
arrayToJson(allemails);

window.location.href = currentLink;



function arrayToJson(array) {
    console.log(array,"array to json");
    const dataStr = JSON.stringify(array.join(','));
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    let link = document.createElement('a');
    link.download = "emails.json"
    link.href = url;
    link.click();
  }
  
