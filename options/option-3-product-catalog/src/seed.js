'use strict';
// Public, made-up sample catalog (no real or customer data). 48 products, 6 categories.
const RAW = {
  books: [
    ['Clean Code Handbook', 'Practical guide to writing readable, maintainable software.', 32.5],
    ['The Pragmatic Path', 'Career and craft advice for working developers.', 41.0],
    ['Designing Data Systems', 'Reliable, scalable and maintainable data-intensive apps.', 54.99],
    ['Intro to Algorithms Lite', 'Sorting, graphs and dynamic programming explained simply.', 28.75],
    ['Mystery at Harbor Lane', 'A cosy detective novel set in a seaside town.', 12.99],
    ['Space Opera Omnibus', 'Three classic science-fiction adventures in one volume.', 24.0],
    ['Cooking for Busy People', '120 quick weeknight recipes with simple ingredients.', 19.5],
    ['Kids Coding Adventures', 'Learn programming through puzzles and stories.', 15.25],
  ],
  electronics: [
    ['Wireless Earbuds Pro', 'Noise-cancelling Bluetooth earbuds with 30h battery.', 89.99],
    ['USB-C Charging Hub', '7-in-1 hub with HDMI, SD reader and 100W pass-through.', 39.95],
    ['Mechanical Keyboard', 'Hot-swappable switches and RGB backlight.', 109.0],
    ['4K Monitor 27"', 'IPS panel, HDR10, USB-C power delivery.', 329.0],
    ['Smart Desk Lamp', 'Adjustable colour temperature with app control.', 45.5],
    ['Portable SSD 1TB', 'USB 3.2 Gen 2 solid state drive, pocket sized.', 99.99],
    ['Webcam HD 1080p', 'Auto-focus webcam with dual microphones.', 49.0],
    ['Wireless Mouse', 'Ergonomic silent-click mouse, 18-month battery.', 22.99],
  ],
  toys: [
    ['Building Blocks Set', '500-piece creative construction set for ages 6+.', 34.99],
    ['Remote Control Car', 'Off-road RC car with rechargeable battery.', 59.0],
    ['Puzzle 1000 Pieces', 'Mountain landscape jigsaw puzzle.', 18.5],
    ['Plush Bear', 'Soft, washable teddy bear, 35cm.', 16.0],
    ['Science Kit', '30 safe experiments about chemistry and physics.', 29.95],
    ['Wooden Train Set', 'Classic wooden railway with bridge and tunnel.', 64.0],
    ['Board Game Night', 'Strategy board game for 2-5 players.', 39.0],
    ['Kite Rainbow', 'Easy-to-fly delta kite with 50m line.', 14.75],
  ],
  home: [
    ['Ceramic Mug Set', 'Set of four stoneware mugs, dishwasher safe.', 26.0],
    ['Cotton Bath Towels', 'Pack of two soft, quick-dry towels.', 31.5],
    ['Aroma Diffuser', 'Ultrasonic essential-oil diffuser with timer.', 27.99],
    ['Non-stick Frying Pan', '28cm pan suitable for all hobs.', 35.0],
    ['Indoor Plant Pot', 'Self-watering pot for small plants.', 13.25],
    ['Wall Clock Minimal', 'Silent sweep wall clock, 30cm.', 21.0],
    ['Storage Baskets', 'Set of three woven baskets with handles.', 29.0],
    ['LED String Lights', '10m warm-white fairy lights, USB powered.', 11.99],
  ],
  sports: [
    ['Yoga Mat', 'Non-slip 6mm mat with carrying strap.', 24.99],
    ['Adjustable Dumbbells', 'Pair of 2-20kg quick-change dumbbells.', 149.0],
    ['Running Water Bottle', 'Insulated 750ml bottle keeps drinks cold 24h.', 19.0],
    ['Jump Rope Speed', 'Ball-bearing speed rope for cardio training.', 9.99],
    ['Tennis Racket', 'Lightweight graphite racket for beginners.', 79.0],
    ['Football Size 5', 'Match-quality hand-stitched football.', 27.5],
    ['Cycling Helmet', 'Ventilated helmet with adjustable fit.', 55.0],
    ['Resistance Bands', 'Set of five bands with door anchor.', 17.5],
  ],
  clothing: [
    ['Rain Jacket', 'Waterproof breathable jacket with hood.', 69.0],
    ['Merino Socks', 'Pack of three warm, odour-resistant socks.', 22.0],
    ['Running Shoes', 'Cushioned road-running shoes.', 119.0],
    ['Denim Jeans', 'Slim-fit stretch denim jeans.', 49.5],
    ['Cotton T-Shirt', 'Organic cotton crew-neck tee.', 15.0],
    ['Wool Beanie', 'Rib-knit beanie, one size.', 18.0],
    ['Hoodie Classic', 'Fleece-lined pullover hoodie.', 42.0],
    ['Sun Hat', 'Wide-brim UPF 50 sun hat.', 23.5],
  ],
};

function sampleProducts() {
  const base = Date.UTC(2026, 0, 1);
  const products = [];
  let n = 0;
  for (const [category, items] of Object.entries(RAW)) {
    for (const [name, description, price] of items) {
      products.push({
        id: `p${String(++n).padStart(3, '0')}`,
        name,
        description,
        category,
        price,
        // Interleave dates so "newest" isn't just reverse insertion order.
        createdAt: new Date(base + ((n * 37) % 48) * 86_400_000).toISOString(),
      });
    }
  }
  return products;
}

module.exports = { sampleProducts };
